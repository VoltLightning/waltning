/**
 * The outbox — the one table the phone has and the server does not.
 *
 * `architecture/14` §14.1: **a write materialises into the local tables and
 * records its intent in the outbox.** It does not sit in a queue waiting to
 * become real. That distinction is the whole of the local-first claim: the row
 * is on the ledger the instant you type it, and the entry beside it is the
 * separate fact that a server somewhere has not been told yet.
 *
 * **§5.7 makes this the only irreplaceable file on the device.** `replica.db`
 * can be discarded unconditionally — the server can resend every row in it.
 * `outbox.db` holds intent that exists nowhere else, so losing it loses writes
 * that were never anywhere to be recovered from. They are separate database
 * files for that reason, and this table lives in the second one.
 *
 * It is deliberately **not** in `packages/schema`: there is no Postgres
 * counterpart to keep it honest against, and inventing one would put a table on
 * the server whose only purpose is to make a parity assertion pass.
 */

import { randomId } from "@waltning/core/random";
import { type SQL, sql } from "drizzle-orm";
import { index, integer, sqliteTable, text } from "drizzle-orm/sqlite-core";

/**
 * Where an entry is in its life.
 *
 * `sending` exists because a process can die mid-request. iOS gives no callback
 * on force-quit, so an entry that was in flight cannot be distinguished from one
 * that completed unless the state is written *before* the request goes out —
 * and every `sending` entry is reset to `pending` at launch, on the principle
 * that a duplicate send is recoverable (`outbox_receipts` deduplicates it) and
 * a lost send is not.
 */
export const OUTBOX_STATE = ["pending", "sending", "blocked", "stalled"] as const;
export type OutboxState = (typeof OUTBOX_STATE)[number];

/**
 * Whether being blocked is forever.
 *
 * `architecture/08` §"`blocked` is not always terminal": two of the common
 * causes clear themselves. A capture dated inside a period that closed while
 * you were offline **auto-requeues when the period is reopened**; a receipt
 * image too large recompresses once and retries. `terminal` is validation, a
 * malformed payload, a deleted target — S30 offers an edit or a discard, and
 * nothing but a person will ever move it.
 *
 * One value for both would make S30 either nag about entries that fix
 * themselves or quietly strand entries that never will, and the drain cannot
 * pick between those two behaviours without being told which it is looking at.
 */
export const BLOCKED_KIND = ["terminal", "repairable"] as const;
export type BlockedKind = (typeof BLOCKED_KIND)[number];

/**
 * Why an entry is the way it is, as it matters to the drain and to replay
 * (R2 M4, R4 C2/H1).
 *
 * **Not only a `blocked` thing any more, and that is the rename (R4 C2).**
 * This column was `blockedDisposition`, null except while `state` was
 * `blocked`. `deferred` breaks that: a deferral leaves `state = pending` —
 * the drain must still try it — and needs to be found again on a later
 * launch regardless of `state`, which is a fact about the *entry*, not about
 * being blocked. `disposition` names what it now is.
 *
 * - **`refused`** — the local `apply` itself threw (a folded-name collision,
 *   a stale version, any executor's own check). The write never took effect
 *   here, and it would refuse identically on a retry or on a server for the
 *   same reason — sending it is not "not yet", it is never. `write.ts` sets
 *   this, alongside `blocked(terminal)`, in the same catch.
 * - **`replay_halted`** — this device's own local replay could not apply an
 *   entry that *did* land in the outbox (`recover.ts`'s `haltAt`: no local
 *   executor for the operation, most often an older build against a payload
 *   a newer one wrote). The write itself is not invalid — the phone just
 *   cannot re-derive its local effect right now — so a server may still
 *   accept it; only *local* replay stops here, never the drain. Also set
 *   alongside `blocked(terminal)`.
 * - **`deferred`** (R4 C2/H1) — the replica cannot apply this entry *yet*
 *   (`LocalDeferral`: no pivot, no last-known rate), or a later `LocalRefusal`
 *   was met while an earlier entry was itself still deferred, which makes
 *   the refusal untrustworthy — the replica that produced it is known
 *   incomplete (R4 H1). `state` stays `pending`: the drain still sends it.
 *   Cleared (`null`) the moment the entry finally applies.
 *
 * `recover.ts`'s `outstanding` query reads this to skip a `refused` entry on
 * every later launch (R2 M4) — replaying it would only repeat the identical
 * refusal — and to *always* include a `deferred` one regardless of `seq`
 * versus the watermark (R4 C2: without that, a later entry's `applied_seq`
 * advance permanently hides a deferral behind it). A `replay_halted` entry
 * keeps halting replay behind it, exactly as before, since an app update may
 * yet supply the missing executor.
 */
export const DISPOSITION = ["refused", "replay_halted", "deferred"] as const;
export type Disposition = (typeof DISPOSITION)[number];

/**
 * A queued payload: the operation's validated input, as JSON and nothing more.
 *
 * Named rather than written twice, because the column below and the dependency
 * scan at the bottom of this file have to agree on what a payload is — one of
 * them widening would mean the scan reads a shape the table cannot hold, or the
 * table holds a shape the scan cannot walk.
 */
export type OutboxPayload = Record<string, unknown>;

export const outbox = sqliteTable(
  "outbox",
  {
    /**
     * Client-minted, and the idempotency key the server deduplicates on. It must
     * be decided here rather than by the server, because the whole point is that
     * a retry after an unknown outcome carries the *same* id.
     */
    id: text("id").primaryKey().$defaultFn(randomId),

    /**
     * Send order, and **not** the id.
     *
     * `id` carries identity and `seq` carries order, because a UUID sorts by
     * nothing useful and `capturedAt` is a wall clock — which is display-only
     * here for the same reason §14.2 refuses it as a conflict token: two entries
     * can share a millisecond, and a phone's clock can move backwards.
     *
     * Allocated by `claimSeq` below, which is where the one hard property —
     * **it never goes backwards, even across a delete** — is argued and kept.
     */
    seq: integer("seq").notNull(),

    /** The registry operation this replays. */
    operation: text("operation").notNull(),

    /**
     * The validated input, as JSON.
     *
     * Stored parsed-and-re-serialised rather than as the raw request body: what
     * replays must be what the operation accepted, not what arrived.
     */
    payload: text("payload", { mode: "json" }).$type<OutboxPayload>().notNull(),

    /**
     * The entries this one must not overtake.
     *
     * **Derived at enqueue, never hand-maintained** (`architecture/08` §"`seq`
     * carries order"). H13 argues a dependent is never orphaned because the
     * client mints the id, but that covers name collisions only: any *other*
     * refusal of `create_counterparty` leaves five transactions pointing at a
     * row that does not exist. A hand-maintained dependency list "in a queue
     * this varied will be wrong within a month", so `deriveDeps` below reads it
     * out of the payload instead — the one place that cannot be forgotten,
     * because the payload is the thing being queued.
     *
     * Empty rather than null when nothing is depended on: *"this may send now"*
     * is a fact the drain reads on every pass, not an absence.
     */
    deps: text("deps", { mode: "json" })
      .$type<string[]>()
      .notNull()
      .$defaultFn(() => []),

    /**
     * The operation's version at capture (`architecture/08` C24).
     *
     * An app update that changes an operation's shape must still be able to send
     * what the old one captured, or a week of entries is refused by the app that
     * created them. The drain upcasts by this number.
     */
    opVersion: integer("op_version").notNull(),

    state: text("state", { enum: OUTBOX_STATE }).notNull().default("pending"),

    /**
     * Whether this being blocked is forever — null except while it is.
     *
     * It is a property of the *state*, not of the entry: a `repairable` entry
     * that requeues when its period reopens is an ordinary pending entry again,
     * and nothing about it should still claim to be blocked.
     *
     * **The `enum` here is a compile-time guard only.** Drizzle emits no CHECK
     * for it, and this table's DDL is the migrator's to write, so a raw
     * `insert into outbox` will store any string SQLite is handed. The
     * constraint belongs in that DDL beside `state`'s; until it is there, the
     * type is what refuses a third kind, and the test pins that.
     */
    blockedKind: text("blocked_kind", { enum: BLOCKED_KIND }),

    /**
     * Why the entry is the way it is — see `DISPOSITION` above.
     *
     * **R4 C2 — no longer `blockedDisposition`, and no longer lives only
     * while `state` is `blocked`.** `deferred` is set with `state` still
     * `pending`, precisely so the drain keeps trying it; `refused` and
     * `replay_halted` keep the old lifetime, alongside `blockedKind`. Same
     * compile-time-only guarantee as `blockedKind`: nothing in this table's
     * DDL stops a raw insert from writing a fourth string.
     *
     * R2 L3 — S30 reads this, when it is set, to choose its wording: a
     * `refused` entry gets no retry (it would only refuse identically), a
     * `replay_halted` one still offers to wait for an app update, a
     * `deferred` one is already retrying on its own. Null — the ordinary
     * entry with nothing outstanding — surfaces none of that.
     */
    disposition: text("disposition", { enum: DISPOSITION }),

    /**
     * What to tell the person, latched at the moment it blocked.
     *
     * `architecture/08`: `blocked` *"asserts futility, so it must say why and
     * offer a way out"*, where `stalled` asserts only that retries ran out. S30
     * renders this and the way out is chosen from `blockedKind`.
     *
     * **This is not `lastError` under a second name, and the difference is
     * lifetime.** `lastError` is last-write-wins text from the most recent
     * attempt; a `repairable` entry that requeues when its period reopens and
     * then meets a captive portal would have its explanation overwritten by a
     * transport message, and S30 would offer a retry where the answer was
     * *reopen the period*. This one is written on the transition into `blocked`
     * and not touched again for as long as that state lasts.
     *
     * **`blocked` is not the only state that writes it.** A `deferred` entry
     * carries a reason here too, with `state` left at `pending` — the whole
     * point of a deferral is that the entry is still queued and will be tried
     * again (see `disposition` above). So this column's presence says "there is
     * something to tell the person about this entry", never "this entry is
     * blocked"; `state` and `disposition` together are what say which. Reading
     * a non-null `blocked_reason` as a block is how a deferral would come to be
     * rendered as a dead end in S30.
     */
    blockedReason: text("blocked_reason"),

    /** How many times the drain has tried. Bounded, then `stalled` (§08). */
    attempts: integer("attempts").notNull().default(0),

    /**
     * Why it is blocked or stalled, for S30 to render.
     *
     * The **most recent attempt's** failure, overwritten by every retry — which
     * is exactly what `blockedReason` above deliberately is not.
     */
    lastError: text("last_error"),

    /**
     * When the drain last put this on the wire.
     *
     * `architecture/08`: set on the transition to `sending`, **for crash
     * recovery**. Launch resets every `sending` entry to `pending`
     * unconditionally, which handles the force-quit; this handles the live
     * drain, which otherwise cannot tell an entry that has been in flight for
     * two seconds from one whose request died with the socket.
     *
     * An integer timestamp rather than §08's `string`: `capturedAt` below is one
     * already, and a table storing two encodings of an instant is a bug waiting
     * for whoever first reads them in the same query.
     */
    sentAt: integer("sent_at", { mode: "timestamp" }),

    /**
     * When the person captured it. **Display only.**
     *
     * Never used for ordering, never used to resolve a conflict — §14.2 is
     * explicit that a write does not race a wall clock.
     */
    capturedAt: integer("captured_at", { mode: "timestamp" })
      .notNull()
      .$defaultFn(() => new Date()),

    /**
     * The IANA zone the capture happened in.
     *
     * Kept **separate from the accounting date**, which `CLAUDE.md` requires to
     * be a bare `YYYY-MM-DD` that no timezone may ever move. `SPEC.md` §"the
     * timezone that lags the border" is why the zone is kept at all: land in
     * Tbilisi at 01:00 after four hours in airplane mode and the phone still
     * says Warsaw, where it is 23:00 *yesterday*, so every capture in that
     * window is permanently dated a day early. A drain therefore flags any entry
     * whose zone differs from its predecessor — *"you changed timezone — check
     * these 4 dates."* That check reads this column and nothing else.
     *
     * `notNull` with **no default**, and both halves are deliberate. Nullable
     * would make the drift check silently skip precisely the entries it exists
     * to catch. A `$defaultFn` reading the runtime's zone would record whichever
     * process ran the insert — a drain, a reconciler, a test — rather than where
     * the person was standing; the capture site knows, and nothing downstream
     * of it does.
     */
    capturedTz: text("captured_tz").notNull(),

    /**
     * Minutes east of UTC at the moment of capture (`120` for Warsaw in July).
     *
     * The zone alone cannot answer it, which is the whole reason this is a
     * second column and not a derivation. `Europe/Warsaw` is `+60` in January
     * and `+120` in July, so a zone plus an instant needs the tz database to
     * resolve — and that database is *revised*: a country that changed its DST
     * rule since the capture makes today's rules reconstruct yesterday's offset
     * wrongly, silently, and only for the captures that straddle the change.
     * The zone records who you were; the offset records what the clock actually
     * read, and only the second survives a rule change.
     */
    capturedOffsetMinutes: integer("captured_offset_minutes").notNull(),
  },
  (table) => [
    /**
     * The drain's only read: `state = 'pending' order by seq`.
     *
     * Not a speed claim — entries are removed on success, so the queue is small
     * whenever anything is working. It is a claim about the case where nothing
     * is: the week offline this table exists for, or a backlog of `blocked` and
     * `stalled` entries that every pass would otherwise scan past to find the
     * few that can still be sent. Leading on `state` and trailing on `seq` is
     * what makes that read both filtered and already ordered.
     *
     * Like the CHECK that `blockedKind` wants, this only takes effect in the DDL
     * the migrator emits.
     */
    index("outbox_pending_by_seq").on(table.state, table.seq),
    /**
     * `recover.ts`'s `outstanding` query, R4 C2's other half: "every entry
     * with `disposition = 'deferred'`, regardless of `seq` versus the
     * watermark" is a scan with no `state`/`seq` prefix to lean on — this
     * table's only other index is useless for it. Partial, on the one value
     * that query actually looks for, so an outbox otherwise full of `null`
     * dispositions costs this index nothing to maintain.
     */
    index("outbox_deferred").on(table.disposition).where(sql`${table.disposition} = 'deferred'`),
  ],
);

/**
 * The high-water mark `seq` is handed out from. One row, and it only ever goes
 * up.
 *
 * **It exists because `max(seq) + 1` is wrong and SQLite will not let this table
 * say so in DDL.** The two halves of that, in order:
 *
 * `max(seq) + 1` reuses numbers. Entries are *removed* on a successful drain, so
 * a queue that empties hands the next capture `1` again — while the replica's
 * `applied_seq` watermark still reads `3`. That entry is permanently below the
 * watermark, so if the crash window catches it, its replica row is missing and
 * **the reconciler will never look at it**: a silently lost row, in a system
 * whose entire claim is that it does not lose writes. It cannot happen until the
 * queue has drained at least once, which is to say never in testing and always
 * in use.
 *
 * `architecture/08` asks for `AUTOINCREMENT` and gives no reason; the watermark
 * is the reason, and `AUTOINCREMENT` is exactly the SQLite feature that survives
 * a delete — a plain `INTEGER PRIMARY KEY` reuses the number just as `max + 1`
 * does. **But this table cannot have it.** The keyword is legal only on `INTEGER
 * PRIMARY KEY`, one per table, and the primary key here is `id`, which cannot
 * move because it is the idempotency key the server deduplicates on. Both
 * shapes were tried against real SQLite: `seq integer autoincrement` beside a
 * text key is a syntax error, and `seq integer primary key autoincrement` beside
 * it is *"table has more than one primary key"*.
 *
 * So the counter is a row instead of a keyword. It is bumped in the same
 * transaction as the insert it numbers, which is the same guarantee
 * `sqlite_sequence` would have given, in the one place a reader can see it. And
 * it keeps the property the old `max + 1` was reaching for: send order is
 * **insert** order, deliberately, not as a side effect of how the number is
 * stored.
 *
 * `seq` orders the queue and identifies nothing; `id` is the identity. What has
 * changed is that `seq` may now also be *compared against a number the replica
 * remembers*, and that is what makes reuse fatal rather than untidy.
 *
 * **A row rather than a keyword is also the only version of this that ships.**
 * The migrator builds the outbox database by reproducing columns, affinities,
 * `primary key` and `not null` — an `AUTOINCREMENT`, a `CHECK` or an index
 * declared here would be silently dropped on the way to the device, and a
 * monotonicity that exists in one database and not the other is worse than none.
 * This table is a second table in the outbox file, so the migrator's chain must
 * name it; today that chain asserts it is creating exactly one.
 */
export const outboxSeq = sqliteTable("outbox_seq", {
  /** Always `0`. A primary key over a single row is how "there is one" is said in SQL. */
  id: integer("id").primaryKey(),
  /** The last number handed out. Never decreases, and never skips backwards over a delete. */
  issued: integer("issued").notNull(),
});

/** The counter's only row. */
const SEQ_ROW = 0;

/**
 * Whatever can run a statement and hand back the row it returned.
 *
 * A structural parameter rather than drizzle's database type, and the reason is
 * the call site: allocating **must** happen inside the transaction that does the
 * insert, so this has to accept a transaction handle as readily as a database —
 * and naming drizzle's generic type here would drag the driver's run-result and
 * the whole schema map through a function that touches neither.
 */
export type SeqAllocator = {
  get<TRow>(query: SQL): TRow;
};

/**
 * Claim the next sequence number, monotonically.
 *
 * **Call it inside the transaction that inserts the entry.** One statement, so
 * two concurrent writes cannot read the same value: SQLite's upsert bumps and
 * returns in a single step, and a rollback of the insert takes the bump with it.
 *
 * It is a function with a side effect rather than the SQL fragment this used to
 * be, and that is the honest shape — the old `nextSeq` read like a value and was
 * safe only because of where it was pasted.
 */
export function claimSeq(allocator: SeqAllocator): number {
  const row = allocator.get<{ issued: number } | undefined>(sql`
    insert into ${outboxSeq} (id, issued) values (${SEQ_ROW}, 1)
    on conflict(id) do update set issued = issued + 1
    returning issued
  `);

  if (typeof row?.issued !== "number") {
    // Checked rather than asserted: a claimed-but-unread number would be handed
    // to the insert as `undefined`, and the entry would land with a null order.
    throw new Error("the outbox sequence returned no number — the write must not proceed");
  }

  return row.issued;
}

/**
 * An unacknowledged entry, as the dependency scan needs to see it.
 *
 * A row plus the one thing the row cannot tell you: which ids it is about to
 * bring into existence. That is a property of the *operation* — `create_*`
 * mints, `update_*` names something already there — so it is supplied by the
 * caller that knows rather than guessed at here from the payload.
 */
export type UnacknowledgedEntry = {
  /** The entry's own id. This is what lands in a dependent's `deps`. */
  readonly id: string;
  /**
   * The client-minted ids this entry brings into existence — the counterparty
   * `create_counterparty` is about to create, the transaction a receipt will
   * hang off. Those, not the entry id, are what a later payload actually names.
   */
  readonly mintedIds: readonly string[];
};

/**
 * The entries a payload must not be sent ahead of.
 *
 * `architecture/08`: *"scan the payload for any client-minted id belonging to an
 * entry not yet acknowledged, and add it"* — **derived at enqueue**, because the
 * alternative is a hand-maintained list that "will be wrong within a month".
 *
 * **Pure, and takes the queue as an argument** rather than querying for it.
 * Enqueue already runs inside the transaction that holds those rows, so passing
 * them in costs nothing there and buys a function that can be tested without a
 * database — which matters, because the interesting cases are payload shapes,
 * not storage.
 *
 * **The scan recurses**, and has to: real payloads nest. A transaction's
 * counterparty arrives as `lines[0].counterparty_id`, a split as an array of
 * objects, and a top-level-only scan would return an empty list for exactly the
 * payloads whose ordering matters most — silently, and looking correct.
 *
 * Every string in the payload is matched against the queue's ids, without
 * caring which field it sat in. The bias is deliberate: a false positive costs
 * an ordering constraint that the queue's own seq order was going to honour
 * anyway, and a false negative costs a dependent sent ahead of the row it names
 * — a 404, a block, and a repair on S30 for something nobody did wrong.
 *
 * The caller passes the queue **as it stands before the insert**; an entry
 * cannot depend on itself, and there is nothing here to stop one that is handed
 * its own row.
 */
export function deriveDeps(
  payload: OutboxPayload,
  unacknowledged: readonly UnacknowledgedEntry[],
): string[] {
  const named = new Set<string>();
  collectStrings(payload, named, new WeakSet());

  // The entry id counts alongside the minted ids: it comes from the same mint,
  // `writeLocally` hands it back to its caller, and a payload composed from a
  // previous write's result can therefore name it directly.
  return unacknowledged
    .filter((entry) => named.has(entry.id) || entry.mintedIds.some((minted) => named.has(minted)))
    .map((entry) => entry.id);
}

/** Every string anywhere in a JSON value, arrays and nested objects included. */
function collectStrings(
  value: OutboxPayload[string],
  into: Set<string>,
  seen: WeakSet<OutboxPayload>,
): void {
  if (typeof value === "string") {
    into.add(value);
    return;
  }
  if (!isWalkable(value)) return;

  // A payload is JSON by the time it is stored, but `deriveDeps` runs before
  // that — on an object a caller built, which can hold a cycle. Without this the
  // scan would not throw, it would hang, on the write path, on a phone.
  if (seen.has(value)) return;
  seen.add(value);

  for (const child of Object.values(value)) collectStrings(child, into, seen);
}

/**
 * Objects and arrays, which `Object.values` walks identically — the distinction
 * between them is one this scan has no use for, since only the leaves matter.
 */
function isWalkable(value: OutboxPayload[string]): value is OutboxPayload {
  return typeof value === "object" && value !== null;
}
