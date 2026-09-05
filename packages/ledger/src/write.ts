/**
 * The local write path — the second executor.
 *
 * `architecture/14` §14.1: **a write records its intent in the outbox and
 * materialises into the local tables.** It does not sit in a queue waiting to
 * become real.
 *
 * That used to read "both, or neither", and it was one `db.transaction`. It is
 * not one transaction any more, because it cannot be. §5.7 puts the two stores
 * in **two files**, and SQLite is explicit about what that costs — from its own
 * list of WAL's disadvantages: *"Transactions that involve changes against
 * multiple ATTACHed databases are atomic for each individual database, but are
 * not atomic across all databases as a set."* One transaction spanning both
 * files was never on offer once they became two files.
 *
 * So the guarantee is weaker and the ordering carries it instead:
 *
 * 1. **The outbox entry commits, alone.**
 * 2. **The replica row commits, with the watermark, in one transaction.**
 *
 * The outbox goes first because it is the half that cannot be reconstructed —
 * it holds the only copy of intent that has not reached a server, while the
 * replica is rebuildable from the server plus the outbox once a server exists
 * or, when the phone stands alone, from the outbox itself. When only one of the
 * two can be made durable first, it has to be the irreplaceable one.
 * `defects.md` C31 records the reversal.
 *
 * The window a crash opens is therefore **an entry whose row is missing, never
 * a row with no entry** — a list short by one line until the next launch, which
 * `recover.ts` then repairs. The other order loses the capture outright, and
 * nothing can repair that because nothing knows it happened.
 *
 * **This takes its stores as a parameter**, per `architecture/11`: a function
 * that closes over a singleton is one that cannot be tested against a scratch
 * database, and the whole guarantee here is about what survives a crash.
 */

import { type ExtractTablesWithRelations, eq } from "drizzle-orm";
import type { SQLiteTransaction } from "drizzle-orm/sqlite-core";
import type { z } from "zod";
import {
  describeLedgerError,
  emitLedgerDiagnostic,
  type LedgerDiagnostics,
} from "./diagnostics.ts";
import {
  type AnyLocalExecutor,
  LocalDeferral,
  type LocalExecutor,
  LocalRefusal,
  type LocalRegistry,
} from "./executor.ts";
import { advanceAppliedSeq } from "./migrate.ts";
import type { Ledger, LedgerSchema } from "./open.ts";
import { claimSeq, deriveDeps, type OutboxPayload, outbox } from "./outbox.ts";

/**
 * The transaction handle for a database with a given run-result and schema.
 *
 * **Nothing here declares a `LocalDb` type, and that is the point.** A named
 * alias for "any database" has to *say* what it will accept in both positions —
 * `unknown` for the driver's run-result, `Record<string, unknown>` for the
 * schema — and those are answers to questions this module never asks.
 *
 * Inferred at the one call site instead. `TRun` is never written down at all;
 * `TSchema`'s constraint is stated once, in the signature below, and it has to
 * be stated somewhere because a schema map is heterogeneous by definition.
 */
export type LocalTx<TRun, TSchema extends LedgerSchema> = SQLiteTransaction<
  "sync",
  TRun,
  TSchema,
  ExtractTablesWithRelations<TSchema>
>;

/**
 * When and where a capture happened, as the person experienced it.
 *
 * Separate from the accounting date on purpose — `CLAUDE.md`: *"Accounting
 * dates are bare `YYYY-MM-DD` strings… `capturedTz` is a separate field."* The
 * date is what the write is *about*; this is where the phone was standing.
 */
export type Capture = {
  /** IANA zone, e.g. `Europe/Warsaw`. Required: see `outbox.capturedTz`. */
  timeZone: string;
  /**
   * The UTC offset in force at capture.
   *
   * Carried beside the zone because the zone alone cannot reconstruct it: the
   * tz database is revised, and the same zone has different offsets either side
   * of a DST boundary.
   */
  offsetMinutes: number;
  /** Display only, never ordering. Defaults to now. */
  at?: Date | undefined;
};

/** What a caller declares about the write it is making. */
export type LocalWrite<Input extends z.ZodTypeAny, Row, Tx> = {
  /**
   * The device implementation of the operation being performed.
   *
   * Concrete rather than a name looked up in the registry, so the row type
   * survives to the caller. The registry below is for the *other* entries.
   */
  executor: LocalExecutor<Input, Row, Tx>;

  /**
   * Every executor the app knows.
   *
   * Needed because `deriveDeps` matches a new payload against the ids that
   * already-queued entries are **about to create**, and only each entry's own
   * operation can say what those are. An entry whose operation is missing from
   * the registry contributes no minted ids, which biases toward a missing
   * dependency — recorded rather than hidden, see below.
   */
  registry: LocalRegistry<Tx>;

  /** The input, unvalidated. Parsed here, before anything is written. */
  input: unknown;

  capture: Capture;

  /**
   * Operational evidence, local to this device.
   *
   * **R3 M4.** This never receives the raw `input` or `payload` object — every
   * event above is a fixed shape of scope/phase/boundary/operation/seq, plus,
   * on failure, `describeLedgerError(error)`. That last part is not silence
   * about the write's content: a `LocalRefusal`'s `message` is built *from*
   * the input it refused (a name, an id, a balance — see any
   * `*.executor.ts`), and `describeDiagnosticError` (`packages/core`) keeps a
   * caught error's `message` verbatim. So a refusal's diagnostic event carries
   * whatever that refusal's text names. That is deliberate, not a leak to fix:
   * the message is the same user-facing refusal text a client maps to UI
   * copy, and redacting it here would make the sink disagree with what the
   * person who triggered it was shown. What stays true is narrower than the
   * old claim: this sink is a local callback the caller supplies — nothing in
   * this module sends it anywhere — so whatever it does receive stays on the
   * device unless the caller's own sink chooses to forward it.
   */
  diagnostics?: LedgerDiagnostics;
};

export type LocalWriteResult<Row> = {
  row: Row;
  /** The outbox entry's id — the idempotency key the server will deduplicate on. */
  entryId: string;
  /** Its place in the queue, and what the replica's watermark now reads. */
  seq: number;
  /**
   * Entries this one must not overtake, as derived at enqueue.
   *
   * Returned rather than left in the row so a caller can assert on it without
   * a second query — the dependency scan is the part of this function most
   * likely to be wrong, and the least likely to announce it.
   */
  deps: readonly string[];
};

/**
 * Apply a write locally and record its intent.
 *
 * Returns the row as the local tables now hold it, and the id of the entry that
 * will carry it to a server if one ever exists.
 *
 * **Throws before writing anything if the input does not validate.** The parse
 * happens first, outside both transactions, so an invalid capture leaves no
 * entry to repair and no row to explain.
 */
export function writeLocally<Input extends z.ZodTypeAny, Row, TRun, TSchema extends LedgerSchema>(
  ledger: Ledger<TRun, TSchema>,
  write: LocalWrite<Input, Row, LocalTx<TRun, TSchema>>,
): LocalWriteResult<Row> {
  const { executor, registry, capture, diagnostics } = write;

  // Parsed once, here. What the outbox stores must be what the operation
  // accepted rather than what arrived, and what `apply` receives must be the
  // same value — parsing twice would let a transform disagree with itself.
  const input = executor.input.parse(write.input);
  const payload = toPayload(input);

  // ─── 1. Intent, alone, in outbox.db ──────────────────────────────────────
  emitLedgerDiagnostic(diagnostics, {
    scope: "local_write",
    phase: "start",
    boundary: "outbox",
    operation: executor.operation,
  });
  let enqueued: { entryId: string; seq: number; deps: string[] };
  try {
    enqueued = ledger.outbox.db.transaction((tx) => {
      // Inside the transaction, so a rollback takes the number with it.
      const seq = claimSeq(tx);

      // Every row still in the table is unacknowledged by definition — the drain
      // removes an entry when the server admits it, so there is no `state` filter
      // to get wrong here. A `blocked` entry counts: it is still unsent, and a
      // dependent must not overtake it.
      const queued = tx
        .select({ id: outbox.id, operation: outbox.operation, payload: outbox.payload })
        .from(outbox)
        .all();

      const deps = deriveDeps(
        payload,
        queued.map((entry) => ({
          id: entry.id,
          mintedIds: mintedIdsOf(registry[entry.operation], entry.payload),
        })),
      );

      const [row] = tx
        .insert(outbox)
        .values({
          seq,
          operation: executor.operation,
          opVersion: executor.opVersion,
          payload,
          deps,
          capturedTz: capture.timeZone,
          capturedOffsetMinutes: capture.offsetMinutes,
          ...(capture.at ? { capturedAt: capture.at } : {}),
        })
        .returning({ id: outbox.id })
        .all();

      if (!row) {
        // Unreachable with a conforming driver; a throw here rolls the entry back
        // rather than returning a result whose entry id is a lie.
        throw new Error("outbox insert returned no row — the write was rolled back");
      }

      return { entryId: row.id, seq, deps };
    });
  } catch (error) {
    emitLedgerDiagnostic(diagnostics, {
      scope: "local_write",
      phase: "failure",
      boundary: "outbox",
      operation: executor.operation,
      error: describeLedgerError(error),
    });
    throw error;
  }
  emitLedgerDiagnostic(diagnostics, {
    scope: "local_write",
    phase: "success",
    boundary: "outbox",
    operation: executor.operation,
    seq: enqueued.seq,
  });

  // ─── 2. Effect, with the watermark, in replica.db ────────────────────────
  //
  // A crash between the two commits lands here, and `recover.ts` replays it.
  // The watermark advances *inside* this transaction, which is the reason it
  // lives in the replica rather than beside the entry: watermark and row are
  // then in one file, so that pair really is atomic even though the cross-file
  // pair is not.
  emitLedgerDiagnostic(diagnostics, {
    scope: "local_write",
    phase: "start",
    boundary: "replica",
    operation: executor.operation,
    seq: enqueued.seq,
  });
  let row: Row;
  try {
    row = ledger.replica.db.transaction((tx) => {
      const applied = executor.apply(input, tx);
      advanceAppliedSeq(tx, enqueued.seq);
      return applied;
    });
  } catch (error) {
    // R2 M2 — only a `LocalRefusal` is a refusal. It used to be every throw
    // out of `apply`: a collision `create_counterparty` throws, a stale
    // `update_counterparty` version, *and* a broken driver or a violated
    // invariant, indistinguishably. The first group refuses identically on
    // any retry, so it is marked `blocked` here, in this same catch — the
    // entry never gets a chance to look sendable (R2 H6). The second is the
    // crash window `architecture/08` exists for: the write itself may still
    // be good, so the entry is left exactly as the first commit left it —
    // `pending`, real, unsent, and drainable — and `recover.ts` is what
    // replays it, never this catch.
    //
    // R2 M4 — `disposition: "refused"`, never `"replay_halted"`
    // (`recover.ts`'s own halt): this write's own `apply` rejected it, so it
    // will refuse identically on any retry or on a server. `outbox.ts`
    // documents the distinction `recover.ts`'s `outstanding` query reads.
    //
    // R4 C2 — `LocalDeferral` is now matched too, below, and no longer falls
    // through untouched. It used to: the entry was left exactly as the
    // outbox commit left it, `pending` with nothing recorded, on the theory
    // that `recover.ts` would retry it "at every launch until that state
    // arrives." That theory was false the moment a *later* entry applied
    // first: `advanceAppliedSeq` is a monotonic max, so a normal write at
    // seq 2 following this deferral at seq 1 pushed the watermark to 2, and
    // `recover.ts`'s old `gt(seq, applied)` filter then hid seq 1 forever —
    // its effect was never present, but nothing said so. `disposition:
    // "deferred"` is what `recover.ts`'s `outstanding` query now matches on
    // *regardless of seq*, so the entry stays findable no matter how far the
    // watermark moves past it. `state` is deliberately untouched — it stays
    // `pending`, exactly as the outbox commit left it, because the drain
    // must still try to send it (§14.1) and local replay must still retry
    // it, neither of which a `blocked` write.ts would ever attempt.
    //
    // R2 H1-r4 — a `LocalRefusal` met here is not automatically trustworthy,
    // the same reason `recover.ts`'s own `anyDeferredSoFar` (R4 H1) exists:
    // this write's own `apply` may have refused it only because an earlier
    // capture is itself still `deferred` — a rate not yet known, say — and
    // the row this write names (an update's target transaction, most often)
    // has therefore not materialised yet, not because it never will. Every
    // entry this one could depend on was claimed a lower `seq` than this
    // one, so "any entry still `deferred`" is exactly "an entry ahead of
    // this one is still outstanding" — this write's own enqueue above ran
    // before `apply`, so its own entry cannot be the one this query finds.
    //
    // **#116 review, H2 — but only when the refusal itself is `dependency`-shaped.**
    // Through this round, *any* `LocalRefusal` met while *any* entry anywhere
    // was `deferred` was filed `deferred` too — a stable, permanent refusal
    // (a folded-name collision, a stale `version`, a currency mismatch) that
    // has nothing to do with the unrelated deferred entry, filed alongside it
    // and so never surfaced to the person who typed it (`architecture/08`
    // H15: a refusal must be visible, not silently retried forever). Only a
    // refusal an executor threw as `dependency: true` — the "no such <row>"
    // checks, which really can be answered differently once the entry ahead
    // resolves — is eligible to become `deferred` this way; everything else
    // refuses unconditionally, on this attempt and every later one.
    if (error instanceof LocalRefusal || error instanceof LocalDeferral) {
      const anEarlierEntryIsDeferred =
        error instanceof LocalRefusal &&
        error.dependency &&
        ledger.outbox.db
          .select({ id: outbox.id })
          .from(outbox)
          .where(eq(outbox.disposition, "deferred"))
          .limit(1)
          .all().length > 0;
      const disposition =
        error instanceof LocalDeferral || anEarlierEntryIsDeferred ? "deferred" : "refused";
      const reason = error.message;
      try {
        ledger.outbox.db
          .update(outbox)
          .set(
            disposition === "refused"
              ? { state: "blocked", blockedKind: "terminal", disposition, blockedReason: reason }
              : { disposition, blockedReason: reason },
          )
          .where(eq(outbox.id, enqueued.entryId))
          .run();
      } catch (blockError) {
        // R2 L1 — the entry would otherwise be left looking ordinary,
        // silently, if recording the disposition itself failed: the caller
        // sees only this write's own error and never learns the entry it
        // queued still needs the mark it just failed to get. The original
        // error travels as `cause` rather than being swallowed.
        const blockReason = blockError instanceof Error ? blockError.message : String(blockError);
        emitLedgerDiagnostic(diagnostics, {
          scope: "local_write",
          phase: "failure",
          boundary: "replica",
          operation: executor.operation,
          seq: enqueued.seq,
          error: describeLedgerError(blockError),
        });
        throw new Error(
          `local_write: failed to mark ${enqueued.entryId} ${disposition} — ${blockReason}`,
          { cause: error },
        );
      }
    }

    emitLedgerDiagnostic(diagnostics, {
      scope: "local_write",
      phase: "failure",
      boundary: "replica",
      operation: executor.operation,
      seq: enqueued.seq,
      error: describeLedgerError(error),
    });
    throw error;
  }
  emitLedgerDiagnostic(diagnostics, {
    scope: "local_write",
    phase: "success",
    boundary: "replica",
    operation: executor.operation,
    seq: enqueued.seq,
  });

  return { row, entryId: enqueued.entryId, seq: enqueued.seq, deps: enqueued.deps };
}

/**
 * The ids a queued entry is about to bring into existence.
 *
 * Returns nothing for an operation the registry does not know, rather than
 * throwing. The bias is deliberate and it is the *unsafe* direction, so it is
 * worth naming: an unknown operation means a dependent may be enqueued without
 * the dependency it needs. Throwing instead would refuse a fresh, valid capture
 * because of an unrelated stale entry — which is the failure `08` spends its
 * "never drop" rule preventing. `recover.ts` reports the unknown operation, and
 * S30 is where it becomes visible.
 */
function mintedIdsOf<Tx>(
  executor: AnyLocalExecutor<Tx> | undefined,
  payload: OutboxPayload,
): readonly string[] {
  if (!executor) {
    return [];
  }
  try {
    return executor.mintedIds(payload);
  } catch {
    // A stored payload that no longer validates is C24's case — the shape moved
    // and nothing upcast it yet. It still cannot be overtaken, but neither can
    // its minted ids be read; the entry id alone remains matchable.
    return [];
  }
}

/**
 * The parsed input, as the outbox stores it.
 *
 * A Zod output is an object by construction for every registry operation, but
 * the type does not say so, and the outbox column is `Record<string, unknown>`.
 * Checked rather than asserted: a scalar payload would round-trip through JSON
 * as something the drain could not replay, and it would do it quietly.
 */
function toPayload(input: unknown): OutboxPayload {
  if (typeof input !== "object" || input === null || Array.isArray(input)) {
    throw new Error(
      `an operation's input must parse to an object, got ${input === null ? "null" : typeof input}`,
    );
  }
  return input as OutboxPayload;
}
