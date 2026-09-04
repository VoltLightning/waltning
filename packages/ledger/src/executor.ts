/**
 * The phone's half of §14.7 — "two engines, one definition".
 *
 * A registry operation has a handler on the server, in `apps/api`, where it can
 * reach services and Postgres. The same operation needs a second implementation
 * on the device, against SQLite, because §14.1 says a write **materialises into
 * the local tables** rather than sitting in a queue waiting to become real. This
 * is the declaration type for that second implementation.
 *
 * **It exists as a registry rather than a callback for one reason: replay.**
 * `writeLocally` used to take an inline `apply` closure, which works exactly
 * until the process dies between the outbox commit and the replica commit — at
 * which point the entry that must be re-applied is on disk and the closure that
 * knew how to apply it is not. A closure cannot be recovered from a database.
 * An operation *name* can, so the applier has to be addressable by one.
 *
 * The shape deliberately mirrors `core/registry/operation.ts`: a Zod schema, a
 * validating `invoke` built for you, and a widened `Any…` form whose `Output` is
 * `unknown` in a constraint position. That file argues the case for all of it,
 * and a second registry that argued differently would be the drift §11.0 exists
 * to prevent.
 */

import type { z } from "zod";

/**
 * A business refusal — the write is invalid, not merely undelivered.
 *
 * **R2 M2.** `write.ts` used to mark *every* throw out of `apply` as
 * `blocked(refused)` — a collision, a stale version, and a broken driver or a
 * violated invariant all landed on the identical row. Only the first group
 * refuses identically on any retry; the second is the crash-window case
 * `architecture/08` exists for, and forcing it into `refused` told a future
 * launch never to replay a write it should retry.
 *
 * An executor throws `LocalRefusal` for the business case — no such row,
 * already archived, a stale `version`, a rule the write violates — and a
 * plain `Error` for everything else: a return value the driver should never
 * produce, a constraint that should already be impossible. `write.ts`
 * narrows on `instanceof LocalRefusal` to decide which.
 *
 * **R3 M3 — three shapes stay plain `Error`, never `LocalRefusal`, because none
 * of them is reachable with a conforming driver:** the driver returning nothing
 * from an `insert` (seven call sites: "insert returned no row"), a row that
 * "changed between read and write" after its own version already matched on
 * read (the compare-and-swap update or delete finds zero rows despite running
 * inside the same synchronous SQLite transaction that just confirmed the
 * version, so nothing else could have raced it), and a constraint that should
 * already be impossible given the checks above it. A `LocalRefusal` right
 * beside one of these — the stale-version check itself, say — is the real,
 * reachable business case; only the *second*, post-write check of the same row
 * is the impossible one. See `write.ts`'s catch for what the distinction
 * buys: a business refusal blocks the entry forever, so misclassifying an
 * impossible branch as one would drop a capture that a fixed driver could
 * still apply.
 */
export class LocalRefusal extends Error {
  override readonly name = "LocalRefusal";
}

/**
 * A deferral — the replica cannot apply this write yet, but a later launch or
 * a server can; the entry stays pending.
 *
 * **R3 H1.** `create_transaction`'s two no-rate branches (no pivot currency in
 * the replica; no last-known rate for the pair) were `LocalRefusal` through
 * round 3, which `write.ts` marks `blocked(refused)` — and `recover.ts`'s
 * `outstanding` query skips a `refused` entry forever, so the drain never
 * sends it either. That silently drops a capture the operation's own doc
 * comment says survives: *"the throw is not a lost capture … the capture
 * still drains to a server that can resolve the rate"* — and it contradicts
 * `architecture/08` §5's "never drop".
 *
 * The distinction from `LocalRefusal` is retryability, not severity: a
 * refusal is wrong on every retry with the same input, because the business
 * rule it names does not change. A deferral is right on a later retry with
 * the *identical* input, because what is missing is local state — a pivot, a
 * rate row — that a later sync or a fresh launch can supply without the
 * caller doing anything differently. `state` stays exactly `pending`, the
 * outbox commit's own value, so the drain keeps trying to send it and local
 * replay keeps retrying its `apply` — neither one is a "blocked" write.
 *
 * **R4 C2 — but it is not untraceable any more.** Through round 3 a
 * deferral left nothing in the outbox at all, on the theory that
 * `recover.ts` would find it again "at every launch" by the plain fact of
 * its `seq` sitting above the watermark. That theory broke the moment a
 * *later* entry applied first: `advanceAppliedSeq` is a monotonic max, so an
 * ordinary write behind a deferred one pushed the watermark past it, and the
 * old `outstanding` query's `seq > applied` filter then hid the deferred
 * entry forever — a capture that was supposedly never dropped, silently
 * unreachable. `write.ts` and `recover.ts` now both set `disposition:
 * "deferred"` on this class (never touching `state`), and `recover.ts`'s
 * `outstanding` query matches that mark *independently of `seq`*, so the
 * entry is retried at every launch — genuinely, this time — until the
 * missing state arrives, however far the watermark has since moved.
 */
export class LocalDeferral extends Error {
  override readonly name = "LocalDeferral";
}

/**
 * How one operation applies to the local tables.
 *
 * `Tx` is the transaction handle rather than the database, for the same reason
 * `LocalWrite.apply` took one: an executor handed the outer database could open
 * its own transaction, commit separately, and quietly reintroduce the gap the
 * caller is holding a transaction open to close.
 */
export type LocalExecutor<Input extends z.ZodTypeAny, Row, Tx> = {
  /** The registry operation this is the device implementation of. `verb_noun`. */
  operation: string;

  /**
   * The payload shape this executor understands (C24).
   *
   * Recorded on every entry it writes, so the drain knows which upcasters to
   * chain. An executor does not upcast — it is the *current* shape by
   * definition, and a historical payload is upcast to meet it.
   */
  opVersion: number;

  /**
   * The same schema the server operation declares.
   *
   * Not "a schema like it" — §14.7's claim is one definition read twice, and
   * two schemas that agree today are two schemas that disagree later. Passing
   * the server's schema in is the point; this field is the seam where that
   * happens.
   */
  input: Input;

  /**
   * Apply the write to the local tables.
   *
   * Declared with method syntax, not as an arrow property, and the difference is
   * load-bearing for the same reason it is on `Operation.handler`: under
   * `strictFunctionTypes` a property-form function is contravariant in its
   * parameters, so a concrete executor would not be assignable to the widened
   * form a registry holds. Method syntax is bivariant, which is the case it
   * exists for.
   */
  apply(input: z.output<Input>, tx: Tx): Row;

  /**
   * The client-minted ids this write brings into existence.
   *
   * `deriveDeps` scans a new payload for ids belonging to entries not yet
   * acknowledged, and what it needs to match against is not the entry's own id —
   * it is the row ids that entry is about to create. Only the operation knows
   * which those are: `create_counterparty` mints one, a split transaction mints
   * a transaction and a line per split, and every `update_*` mints nothing
   * because it names rows that already exist.
   *
   * **Required, and returning `[]` is a declaration rather than an oversight.**
   * Defaulting it would make the common case silent and the failure invisible:
   * an executor that forgets to declare a mint produces a dependent entry with
   * empty `deps`, which sends ahead of the row it names and blocks with a 404 —
   * for something nobody did wrong. Making it required means that mistake is a
   * compile error instead.
   */
  mints(input: z.output<Input>): readonly string[];

  /**
   * Validate, then apply. **The only entry point a generic caller has.**
   *
   * `AnyLocalExecutor` omits `apply`, so the write path and the reconciler
   * cannot reach past validation even by accident. That matters more here than
   * on the server: a replayed payload has been sitting on a phone across an app
   * update, and may have been upcast on the way in. It is JSON off a disk, which
   * is exactly as trustworthy as JSON off a wire.
   *
   * **Synchronous, unlike the server's `invoke`, and this is not a style
   * choice.** The device's drizzle handle is `BaseSQLiteDatabase<"sync", …>`;
   * `db.transaction(cb)` commits when `cb` *returns*. An async callback returns
   * a pending promise, so the transaction would commit before the work inside it
   * ran — the failure is silent and it is total.
   *
   * Built by `defineLocalExecutor`; never written by hand.
   */
  invoke(raw: unknown, tx: Tx): Row;

  /**
   * `mints`, reached through validation, for a caller holding a raw payload.
   *
   * The widened form drops `mints` for the same reason it drops `apply` — its
   * parameter is the operation's parsed input, which a heterogeneous registry
   * cannot name. `deriveDeps` reads a queue of entries whose payloads came off
   * disk, so this is the door it has to come through.
   */
  mintedIds(raw: unknown): readonly string[];
};

/**
 * Declare an executor.
 *
 * Pins inference so a call site does not restate the input type, and refuses the
 * one name shape that is always a mistake — the name has to match the server
 * operation's exactly, because that string is how a replayed entry finds its way
 * back to this function.
 */
export function defineLocalExecutor<Input extends z.ZodTypeAny, Row, Tx>(
  executor: Omit<LocalExecutor<Input, Row, Tx>, "invoke" | "mintedIds">,
): LocalExecutor<Input, Row, Tx> {
  if (!/^[a-z][a-z0-9_]*$/.test(executor.operation)) {
    throw new Error(`local executor "${executor.operation}": name must be lower_snake_case`);
  }
  if (!Number.isInteger(executor.opVersion) || executor.opVersion < 1) {
    throw new Error(
      `local executor "${executor.operation}": opVersion must be a positive integer, got ${executor.opVersion}`,
    );
  }
  return {
    ...executor,
    // Parsing here rather than trusting the caller is what makes the widened
    // type safe: the reconciler holds an executor it cannot apply without a
    // schema check running first.
    invoke: (raw, tx) => executor.apply(executor.input.parse(raw), tx),
    mintedIds: (raw) => executor.mints(executor.input.parse(raw)),
  };
}

/**
 * The loosest executor a registry may hold, for a given transaction type.
 *
 * `Row` is genuinely unbounded — a registry is heterogeneous by definition and
 * TypeScript has no existential type for "returns *something*". Written once,
 * here, in a constraint position where it cannot widen a value: every concrete
 * declaration keeps its real row type through `defineLocalExecutor`.
 */
export type AnyLocalExecutor<Tx> = Omit<
  LocalExecutor<z.ZodTypeAny, unknown, Tx>,
  "apply" | "mints"
>;

/**
 * Executors keyed by operation name.
 *
 * The key must equal the executor's own `operation`, which `localRegistry`
 * enforces — a registry whose key and name disagree replays the wrong write
 * after a crash, and does it silently.
 */
export type LocalRegistry<Tx> = Readonly<Record<string, AnyLocalExecutor<Tx>>>;

/**
 * Build a registry, checking the one invariant a `Record` cannot state.
 *
 * The lookup key and the executor's `operation` are the same fact in two places,
 * and the reconciler reads an entry's `operation` column to find the executor.
 * If they disagree, a replayed capture is applied by the wrong implementation —
 * which succeeds, writes a plausible row, and reports nothing.
 */
export function localRegistry<Tx>(executors: readonly AnyLocalExecutor<Tx>[]): LocalRegistry<Tx> {
  const byName: Record<string, AnyLocalExecutor<Tx>> = {};

  for (const executor of executors) {
    const existing = byName[executor.operation];
    if (existing) {
      throw new Error(`two local executors named "${executor.operation}"`);
    }
    byName[executor.operation] = executor;
  }

  return Object.freeze(byName);
}
