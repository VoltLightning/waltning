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
import {
  type AnyLocalExecutor,
  LocalDeferral,
  LocalRefusal,
  type LocalRegistry,
} from "./executor.ts";
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
  /**
   * How many outbox entries are `disposition: "deferred"` once this launch's
   * work is done — #116 review, L3: `session.ts`'s own `lastRecovery` comment
   * already promised this count before this field existed to hold it. Read
   * fresh from the outbox on every return path (`haltAt` included), not
   * accumulated through the replay loop, so it reflects entries left over
   * from an earlier launch just as much as ones this pass touched.
   */
  deferred: number;
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
  // R2 M4 — a `refused` entry (`write.ts`'s own catch, or this function's own
  // `blockRefusedAt` below, on a *previous* launch — R3 M2) is skipped here.
  // Its `apply` already threw once, on this exact payload; replaying it every
  // launch would repeat the identical refusal and re-halt everything behind
  // it forever, for a row that was never applied and creates nothing later
  // entries could depend on. A `replay_halted` entry (`recover.ts`'s own
  // `haltAt`) is **not** skipped — it keeps halting replay behind it exactly
  // as before, since it may hold a row a later entry depends on, and an app
  // update may yet supply the executor that was missing.
  //
  // R4 C2 — a `deferred` entry is included **regardless of `seq` versus the
  // watermark**, which is why this is no longer a single `gt(seq, applied)`
  // filter. Before this fix, a `LocalDeferral` left no trace in the outbox at
  // all: a deferred entry at seq 1 followed by an ordinary write at seq 2
  // advanced `applied_seq` to 2 (entry 2 genuinely applied), and the plain
  // `gt(seq, applied)` filter then hid entry 1 forever — its effect was never
  // present, but the watermark said otherwise. Marking it `deferred`
  // (`markDeferredAt` below) and matching on that mark *independently* of the
  // watermark is what makes it outstanding again on every later launch, the
  // same guarantee `write.ts`'s doc comment already claimed and did not keep.
  const notRefused = or(isNull(outbox.disposition), ne(outbox.disposition, "refused"));
  const outstanding = ledger.outbox.db
    .select({
      id: outbox.id,
      seq: outbox.seq,
      operation: outbox.operation,
      payload: outbox.payload,
    })
    .from(outbox)
    .where(or(and(gt(outbox.seq, applied), notRefused), eq(outbox.disposition, "deferred")))
    .orderBy(asc(outbox.seq))
    .all();

  const replayed: string[] = [];

  // R4 H1 — whether any entry already visited this pass is still `deferred`.
  // `outstanding` is in ascending `seq` order, so by the time a later entry's
  // `LocalRefusal` is caught below, every entry that could be "ahead of it"
  // has already been through this loop — including one whose own `seq` sits
  // below the watermark, since a `deferred` entry is fetched regardless of
  // that. A refusal met while this is `true` is not trustworthy: the local
  // state it read to decide "no such row" is exactly the state a still-
  // outstanding deferral has not written yet.
  let anyDeferredSoFar = false;

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
      // R3 M2 — mirrors `write.ts`'s own catch, because replay is the same
      // `apply` call from a different caller and the same three outcomes
      // apply.
      //
      // `LocalRefusal`: the entry's own payload is invalid on any retry —
      // marked `disposition: "refused"` here, same as `write.ts`, so a
      // future launch's `outstanding` query (above) skips it rather than
      // re-refusing it and re-halting everything behind it forever — unless
      // (R4 H1) an earlier entry is itself still `deferred` *and* (the
      // #116-review H2 finding) this refusal is itself `dependency`-shaped,
      // in which case this
      // refusal is untrustworthy for the reason `anyDeferredSoFar` documents
      // above, and is recorded as `deferred` instead of `refused` so it gets
      // retried once the entry ahead of it resolves. A refusal that leaves
      // `dependency` `false` — a folded-name collision, a stale `version`, a
      // currency mismatch — refuses unconditionally: nothing outstanding
      // elsewhere can ever change that answer, the same rule `write.ts`
      // applies. Replay continues past it either way: it never applied, so
      // it creates nothing later entries could depend on.
      //
      // `LocalDeferral`: the missing local state may exist by the *next*
      // launch (or later in *this* one — see the success branch below), so
      // the entry is marked `deferred` (R4 C2) and skipped, retried again by
      // every launch's `outstanding` query until it stops throwing.
      //
      // Anything else is the crash-window/impossible-state case `haltAt`
      // documents, unchanged from before.
      if (error instanceof LocalRefusal) {
        if (error.dependency && anyDeferredSoFar) {
          markDeferredAt(ledger, entry.id, error.message);
        } else {
          blockRefusedAt(ledger, entry, error.message);
        }
        continue;
      }
      if (error instanceof LocalDeferral) {
        markDeferredAt(ledger, entry.id, error.message);
        anyDeferredSoFar = true;
        continue;
      }

      // `catch` bindings are `unknown` because the language gives no choice —
      // normalised to a real `Error` right here so `haltAt` below never has
      // to hold one.
      const asError = error instanceof Error ? error : new Error(String(error));
      return haltAt(ledger, entry, replayed, requeued, asError.message, asError);
    }

    // R4 C2 — an entry that just applied is no longer `deferred`, whether it
    // held that mark from a previous launch or from earlier in this very
    // pass (the seq-1-then-seq-2 case above, resolved in one launch once the
    // rate arrives). A plain, unconditional clear: `disposition` is already
    // `null` for the ordinary entry that never deferred, and setting `null`
    // to `null` costs nothing.
    clearDispositionAt(ledger, entry.id);
    replayed.push(entry.id);
  }

  return { requeued, replayed, halted: null, deferred: countDeferred(ledger) };
}

/**
 * How many outbox entries currently read `disposition: "deferred"` — the
 * count `LaunchRecovery.deferred` reports, read fresh rather than
 * accumulated through the replay loop above (see that field's own doc).
 */
function countDeferred<TRun, TSchema extends LedgerSchema>(ledger: Ledger<TRun, TSchema>): number {
  return ledger.outbox.db
    .select({ id: outbox.id })
    .from(outbox)
    .where(eq(outbox.disposition, "deferred"))
    .all().length;
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
 * `lastError`, and why `disposition` (R2 M4) is written `replay_halted` here,
 * never `refused` — `write.ts`'s catch is the one that means "never send";
 * this one means "local replay stalled, the drain may still succeed."
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
        disposition: "replay_halted",
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
    deferred: countDeferred(ledger),
  };
}

/**
 * Mark an entry `blocked(refused)` after replay's own `apply` call refuses it.
 *
 * **R3 M2.** The counterpart to `write.ts`'s identical marking, needed here
 * for the same reason: without it, the *only* thing that noticed the refusal
 * is this stack frame, and the next launch would call `apply` on the same
 * payload again, get the same `LocalRefusal`, and (before this fix) re-halt
 * every entry behind it — forever, since the refusal is stable across
 * retries. Marking it here is what lets the `outstanding` query above skip it
 * on every later launch, same as a refusal from `write.ts` itself.
 *
 * Unlike `haltAt`, this does not stop replay and does not return a
 * `LaunchRecovery` — the caller `continue`s past it in the same loop, because
 * a refused entry applied nothing and creates no row a later entry could
 * depend on.
 */
function blockRefusedAt<TRun, TSchema extends LedgerSchema>(
  ledger: Ledger<TRun, TSchema>,
  entry: { id: string; seq: number; operation: string },
  reason: string,
): void {
  try {
    ledger.outbox.db
      .update(outbox)
      .set({
        state: "blocked",
        blockedKind: "terminal",
        disposition: "refused",
        blockedReason: reason,
      })
      .where(eq(outbox.id, entry.id))
      .run();
  } catch (blockError) {
    // R2 L1's reasoning, applied here: a failure to *record* the refusal
    // would leave the entry looking `pending` and sendable, silently, when
    // replay already knows it refuses. The original refusal travels as
    // `cause` rather than being swallowed.
    throw new Error(
      `recoverOnLaunch: failed to mark ${entry.id} blocked after a replay refusal — ` +
        (blockError instanceof Error ? blockError.message : String(blockError)),
      { cause: new Error(reason) },
    );
  }
}

/**
 * Mark an entry `deferred` — `state` untouched, still `pending` (R4 C2/H1).
 *
 * The counterpart to `blockRefusedAt` and `haltAt` above, and deliberately
 * unlike both: those two move `state` to `blocked`, because a refusal is
 * never retried and a replay halt stops everything behind it. A deferral is
 * neither — the drain must keep trying to send it (§14.1's "the intent
 * remains in the outbox for a later backend to value"), and local replay
 * continues past it, so `state` stays exactly what the outbox commit left
 * it. Only `disposition` moves, which is the one thing the `outstanding`
 * query above reads to find this entry again regardless of the watermark.
 *
 * Called for two different throws — `write.ts`'s doc comment on
 * `LocalDeferral` and this file's own `outstanding` loop above name both:
 * the executor's own `LocalDeferral` (no rate yet), and a `LocalRefusal` met
 * while an earlier entry is itself still deferred (R4 H1 — the refusal is
 * not trustworthy against a replica known to be incomplete). Both cases mean
 * the same thing here: try this entry again next launch, not "never."
 *
 * **#116 review, H2 — `reason` is latched into `blockedReason` too**, the same field
 * `blockRefusedAt` and `haltAt` write, so S30 can say *why* a `deferred`
 * entry is waiting rather than showing an ordinary pending capture with no
 * explanation. `state` still stays untouched — this is not a `blocked` entry.
 */
function markDeferredAt<TRun, TSchema extends LedgerSchema>(
  ledger: Ledger<TRun, TSchema>,
  entryId: string,
  reason: string,
): void {
  try {
    ledger.outbox.db
      .update(outbox)
      .set({ disposition: "deferred", blockedReason: reason })
      .where(eq(outbox.id, entryId))
      .run();
  } catch (markError) {
    // R2 L1's reasoning, applied a third time: without this, a deferral that
    // fails to *record itself* looks like an ordinary outstanding entry with
    // `seq` below the watermark once a later entry advances it — exactly the
    // silent loss R4 C2 exists to close.
    throw new Error(
      `recoverOnLaunch: failed to mark ${entryId} deferred — ` +
        (markError instanceof Error ? markError.message : String(markError)),
    );
  }
}

/**
 * Clear `disposition` once a `deferred` (or, harmlessly, an already-`null`)
 * entry finally applies (R4 C2).
 *
 * Called from the success branch of the replay loop, unconditionally — the
 * ordinary entry that never deferred already reads `null`/`pending` with no
 * `blockedKind`/`blockedReason`, and writing the same values over themselves
 * is a no-op the `outstanding` query above does not even need to have run
 * for. What matters is that a *previously* `deferred` entry stops matching
 * `eq(outbox.disposition, "deferred")` the moment its effect is actually on
 * the replica, or it would be replayed — impossibly, since SQLite has no
 * second row for it to apply — on every later launch.
 *
 * **#116 review, M4 — `state`, `blockedKind` and `blockedReason` are cleared in the
 * same update, not only `disposition`.** `outstanding`'s own `gt(seq,
 * applied)` half fetches a `replay_halted` entry again too (it is `notRefused`
 * — see above), and this function is what marks it applied when replay finally
 * gets past it, whether because an app update supplied the missing executor
 * or because an entry ahead of it resolved. Clearing `disposition` alone left
 * `state: "blocked"` standing: an entry that had genuinely applied still read
 * as blocked to S30 and to any drain that checks `state`, forever, because
 * nothing ever set it back. `state` returns to `"pending"` — the value the
 * outbox commit gave it before local replay ever touched it — because this
 * entry has not been sent yet; that is the drain's own state to set from
 * here.
 */
function clearDispositionAt<TRun, TSchema extends LedgerSchema>(
  ledger: Ledger<TRun, TSchema>,
  entryId: string,
): void {
  try {
    ledger.outbox.db
      .update(outbox)
      .set({ disposition: null, state: "pending", blockedKind: null, blockedReason: null })
      .where(eq(outbox.id, entryId))
      .run();
  } catch (clearError) {
    throw new Error(
      `recoverOnLaunch: failed to clear disposition on ${entryId} after it applied — ` +
        (clearError instanceof Error ? clearError.message : String(clearError)),
    );
  }
}
