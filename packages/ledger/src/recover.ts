/**
 * What has to happen at launch, before anything reads or writes.
 *
 * Two repairs, for two different crashes, and they are independent of each
 * other — neither orders against the other, so both run and the order here is
 * only the order they are written in.
 *
 * **The requeue** (`architecture/08` §"Crash recovery"): every entry left in
 * `sending` goes back to `pending`. iOS force-quit gives no callback at all, so
 * an entry interrupted mid-request is not an edge case — without this it orphans
 * forever and the pending count never moves, which is H15's own complaint
 * reintroduced. It is safe only because the server keeps an idempotency ledger:
 * a duplicate send is deduplicated, and a lost send is not recoverable at all.
 *
 * **The replay** (`architecture/14` §14.6): `write.ts` commits the outbox entry
 * first and the replica row second, because SQLite offers no transaction across
 * two files. A crash between the two leaves an entry whose row is missing. The
 * replica's `applied_seq` watermark says how far the local tables have caught
 * up, and everything above it is re-applied here.
 *
 * The watermark is what keeps this bounded, and the bound is the whole reason it
 * exists. "Replay every unacknowledged entry" would be the undrained-outbox fold
 * §14.1 rejects by name: with no server the outbox never drains, so every
 * phone-alone launch would sweep the entire history.
 */

import { and, asc, eq, gt, isNull, ne, or } from "drizzle-orm";
import type { AnyLocalExecutor, LocalRegistry } from "./executor.ts";
import { advanceAppliedSeq, readAppliedSeq } from "./migrate.ts";
import type { Ledger, LedgerSchema } from "./open.ts";
import { outbox } from "./outbox.ts";
import type { LocalTx } from "./write.ts";

/** Why replay stopped short, for S30 to render. */
export type ReplayHalt = {
  entryId: string;
  seq: number;
  operation: string;
  reason: string;
};

export type LaunchRecovery = {
  /**
   * Entries moved out of `sending`. Normally empty; one after a hard kill.
   *
   * Ids rather than a count, and read back rather than taken from the driver's
   * run-result: `.run()` returns `TRun`, which is whatever the driver says it
   * is, and constraining it to something with a `changes` field would put a
   * driver's shape in this function's signature to save one query.
   */
  requeued: readonly string[];
  /** Entry ids whose local effect was re-applied, in `seq` order. */
  replayed: readonly string[];
  /**
   * Where replay stopped, or `null` if it finished.
   *
   * **Not a throw**, and not a skip. See `haltAt` below — this is the one design
   * decision in the file that could reasonably have gone another way.
   */
  halted: ReplayHalt | null;
};

/**
 * Repair whatever the last run left behind.
 *
 * **Call this before the first read and before the first write**, and before
 * any drain: a read taken ahead of it sees a ledger short by however many rows
 * the crash cost, and a write taken ahead of it claims a `seq` above a
 * watermark that has not caught up.
 */
export function recoverOnLaunch<TRun, TSchema extends LedgerSchema>(
  ledger: Ledger<TRun, TSchema>,
  registry: LocalRegistry<LocalTx<TRun, TSchema>>,
): LaunchRecovery {
  const requeued = ledger.outbox.db.transaction((tx) => {
    const stranded = tx
      .select({ id: outbox.id })
      .from(outbox)
      .where(eq(outbox.state, "sending"))
      .all();

    tx.update(outbox).set({ state: "pending" }).where(eq(outbox.state, "sending")).run();

    return stranded.map((entry) => entry.id);
  });

  const applied = readAppliedSeq(ledger.replica.db);

  // Ordered, and the ordering is load-bearing: an entry may create a row a
  // later entry updates, so replaying out of order applies an update to
  // something that does not exist yet.
  //
  // R2 M4 — a `refused` entry (`write.ts`'s own catch) is skipped here. Its
  // `apply` already threw once, on this exact payload; replaying it every
  // launch would repeat the identical refusal and re-halt everything behind
  // it forever, for a row that was never applied and creates nothing later
  // entries could depend on. A `replay_halted` entry (`recover.ts`'s own
  // `haltAt`) is **not** skipped — it keeps halting replay behind it exactly
  // as before, since it may hold a row a later entry depends on, and an app
  // update may yet supply the executor that was missing.
  const outstanding = ledger.outbox.db
    .select({
      id: outbox.id,
      seq: outbox.seq,
      operation: outbox.operation,
      payload: outbox.payload,
    })
    .from(outbox)
    .where(
      and(
        gt(outbox.seq, applied),
        or(
          ne(outbox.state, "blocked"),
          isNull(outbox.blockedDisposition),
          ne(outbox.blockedDisposition, "refused"),
        ),
      ),
    )
    .orderBy(asc(outbox.seq))
    .all();

  const replayed: string[] = [];

  for (const entry of outstanding) {
    const executor: AnyLocalExecutor<LocalTx<TRun, TSchema>> | undefined =
      registry[entry.operation];

    if (!executor) {
      return haltAt(
        ledger,
        entry,
        replayed,
        requeued,
        `no local executor for "${entry.operation}"`,
      );
    }

    try {
      ledger.replica.db.transaction((tx) => {
        executor.invoke(entry.payload, tx);
        advanceAppliedSeq(tx, entry.seq);
      });
    } catch (error) {
      // `catch` bindings are `unknown` because the language gives no choice —
      // normalised to a real `Error` right here so `haltAt` below never has
      // to hold one.
      const asError = error instanceof Error ? error : new Error(String(error));
      return haltAt(ledger, entry, replayed, requeued, asError.message, asError);
    }

    replayed.push(entry.id);
  }

  return { requeued, replayed, halted: null };
}

/**
 * Stop replay at an entry that cannot be applied, and say so.
 *
 * **Three options, and the two obvious ones are both wrong.**
 *
 * *Throwing* would brick the app at launch over one entry, and the entry most
 * likely to be unreplayable is one captured by an older build — so the failure
 * would arrive exactly when someone updates, for everyone at once.
 *
 * *Skipping it and advancing the watermark* would claim its effect is present
 * when it is not, and would then apply later entries over a local ledger missing
 * a row they may name. `08`'s "**Never drop**" is about the queue; this is the
 * same principle for the replica.
 *
 * So: mark it `blocked(terminal)` so S30 can show it with the raw payload
 * readable and a way out, leave the watermark below it, and stop. Entries behind
 * it stay unapplied, which is correct — they may depend on it, and a local
 * ledger missing one row in the middle is worse than one that is honestly short
 * from a known point.
 *
 * Note this blocks *local replay*, which is not the same as blocking the drain:
 * the entry can still be sent, and the server does not need the phone to have
 * applied it. That asymmetry is why `blockedReason` exists separately from
 * `lastError`, and why `blockedDisposition` (R2 M4) is written `replay_halted`
 * here, never `refused` — `write.ts`'s catch is the one that means "never
 * send"; this one means "local replay stalled, the drain may still succeed."
 */
function haltAt<TRun, TSchema extends LedgerSchema>(
  ledger: Ledger<TRun, TSchema>,
  entry: { id: string; seq: number; operation: string },
  replayed: readonly string[],
  requeued: readonly string[],
  reason: string,
  /** The error that made replay fail, when there was one — see R2 L1 below. */
  cause?: Error,
): LaunchRecovery {
  try {
    ledger.outbox.db
      .update(outbox)
      .set({
        state: "blocked",
        blockedKind: "terminal",
        blockedDisposition: "replay_halted",
        blockedReason: reason,
      })
      .where(eq(outbox.id, entry.id))
      .run();
  } catch (blockError) {
    // R2 L1 — without this, a failure to *record* the halt loses the halt
    // itself: the caller sees only "could not mark it blocked" and never
    // learns why replay stopped at this entry in the first place. The
    // original replay failure travels as `cause`, real object and stack
    // included when there was one, a fresh `Error(reason)` otherwise.
    throw new Error(
      `recoverOnLaunch: failed to mark ${entry.id} blocked after a replay failure — ` +
        (blockError instanceof Error ? blockError.message : String(blockError)),
      { cause: cause ?? new Error(reason) },
    );
  }

  return {
    requeued,
    replayed,
    halted: { entryId: entry.id, seq: entry.seq, operation: entry.operation, reason },
  };
}
