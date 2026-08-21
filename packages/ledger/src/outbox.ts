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

import { sql } from "drizzle-orm";
import { integer, sqliteTable, text } from "drizzle-orm/sqlite-core";

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

export const outbox = sqliteTable("outbox", {
  /**
   * Client-minted, and the idempotency key the server deduplicates on. It must
   * be decided here rather than by the server, because the whole point is that
   * a retry after an unknown outcome carries the *same* id.
   */
  id: text("id")
    .primaryKey()
    .$defaultFn(() => crypto.randomUUID()),

  /**
   * Send order, and **not** the id.
   *
   * `id` carries identity and `seq` carries order, because a UUID sorts by
   * nothing useful and `capturedAt` is a wall clock — which is display-only
   * here for the same reason §14.2 refuses it as a conflict token: two entries
   * can share a millisecond, and a phone's clock can move backwards.
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
  payload: text("payload", { mode: "json" }).$type<Record<string, unknown>>().notNull(),

  /**
   * The operation's version at capture (`architecture/08` C24).
   *
   * An app update that changes an operation's shape must still be able to send
   * what the old one captured, or a week of entries is refused by the app that
   * created them. The drain upcasts by this number.
   */
  opVersion: integer("op_version").notNull(),

  state: text("state", { enum: OUTBOX_STATE }).notNull().default("pending"),

  /** How many times the drain has tried. Bounded, then `stalled` (§08). */
  attempts: integer("attempts").notNull().default(0),

  /** Why it is blocked or stalled, for S30 to render. */
  lastError: text("last_error"),

  /**
   * When the person captured it. **Display only.**
   *
   * Never used for ordering, never used to resolve a conflict — §14.2 is
   * explicit that a write does not race a wall clock.
   */
  capturedAt: integer("captured_at", { mode: "timestamp" })
    .notNull()
    .$defaultFn(() => new Date()),
});

/**
 * The next sequence number.
 *
 * `max(seq) + 1` inside the same transaction as the insert, so two writes
 * cannot claim one number. An autoincrement column would do the same job and
 * would also tie send order to *insert* order — which is right today and is a
 * property worth being able to change without a migration.
 */
export const nextSeq = sql`coalesce((select max(seq) from outbox), 0) + 1`;
