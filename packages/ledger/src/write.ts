/**
 * The local write path — the second executor.
 *
 * `architecture/14` §14.1: **a write materialises into the local tables and
 * records its intent in the outbox.** Both, or neither.
 *
 * That "or neither" is the entire file. Two separate writes leave two ways to
 * be wrong and both are silent:
 *
 * - **Row without entry.** The transaction is on your ledger, looks completely
 *   normal, and will never reach the server. You find out when a figure
 *   disagrees across two devices, months later, with nothing to indicate which
 *   is right.
 * - **Entry without row.** The drain sends a write for something that is not
 *   there. Best case it fails and stalls; worse, it succeeds, and the server
 *   holds a transaction the phone that created it cannot show you.
 *
 * A process can die between two statements — iOS force-quit gives no callback
 * at all — so the window is not theoretical. One SQLite transaction closes it.
 *
 * **This takes its database as a parameter**, per `architecture/11`: a function
 * that closes over a singleton is one that cannot be tested against a scratch
 * database, and the whole guarantee here is about what survives a crash.
 */

import type { ExtractTablesWithRelations } from "drizzle-orm";
import type { BaseSQLiteDatabase, SQLiteTransaction } from "drizzle-orm/sqlite-core";
import { nextSeq, outbox } from "./outbox.ts";

/**
 * A synchronous drizzle SQLite database.
 *
 * **A type parameter, not a hand-rolled shape.** An earlier draft declared
 * `{ transaction(fn: (tx: never) => T): T; insert: unknown }` — which compiled,
 * and pushed a cast into the body to get anything done. `CLAUDE.md` names that
 * exact move: a placeholder discards the type the caller had and makes every
 * call site pay for it.
 *
 * Driver-neutral by construction: `better-sqlite3` runs the tests because it has
 * real transactions, `expo-sqlite` runs on the device, and both satisfy this.
 * Naming either one would make the driver the thing under test.
 */
export type LocalDb<
  TRun = unknown,
  TSchema extends Record<string, unknown> = Record<string, never>,
> = BaseSQLiteDatabase<"sync", TRun, TSchema>;

/**
 * The transaction handle, as drizzle hands it to a callback.
 *
 * Carried through as type parameters rather than pinned, because a database
 * created with a schema has a *different* type from one created without —
 * `BaseSQLiteDatabase<"sync", unknown>` compiles as a declaration and then
 * refuses every real database at the call site, which is the placeholder
 * failure `CLAUDE.md` describes, arriving one step later than usual.
 */
export type LocalTx<
  TRun = unknown,
  TSchema extends Record<string, unknown> = Record<string, never>,
> = SQLiteTransaction<"sync", TRun, TSchema, ExtractTablesWithRelations<TSchema>>;

/** What a caller declares about the write it is making. */
export type LocalWrite<
  Row,
  TRun = unknown,
  TSchema extends Record<string, unknown> = Record<string, never>,
> = {
  /** The registry operation this replays on the drain. */
  operation: string;
  /** Its version at capture, for the drain's upcasters (C24). */
  opVersion: number;
  /** The validated input, as it will be replayed. */
  payload: Record<string, unknown>;
  /**
   * Apply the write to the local tables.
   *
   * Runs **inside** the transaction that also writes the outbox entry, and is
   * handed the transaction rather than the database so it cannot accidentally
   * escape it — a nested `db.insert(...)` on the outer handle would commit
   * separately and reintroduce exactly the gap this closes.
   */
  apply: (tx: LocalTx<TRun, TSchema>) => Row;
};

export type LocalWriteResult<Row> = {
  row: Row;
  /** The outbox entry's id — the idempotency key the server will deduplicate on. */
  entryId: string;
};

/**
 * Apply a write locally and record its intent, atomically.
 *
 * Returns the row as the local tables now hold it, and the id of the entry that
 * will carry it to a server if one ever exists.
 */
export function writeLocally<Row, TRun, TSchema extends Record<string, unknown>>(
  db: LocalDb<TRun, TSchema>,
  write: LocalWrite<Row, TRun, TSchema>,
): LocalWriteResult<Row> {
  return db.transaction((tx) => {
    const row = write.apply(tx);

    // The insert is *inside* the same transaction and after `apply`, so a
    // failure in either rolls back both. Ordering between them does not matter
    // for atomicity; it matters for reading the code, and intent-after-effect
    // is the order §14.1 describes.
    const [entry] = tx
      .insert(outbox)
      .values({
        operation: write.operation,
        opVersion: write.opVersion,
        payload: write.payload,
        seq: nextSeq as never,
      })
      .returning({ id: outbox.id })
      .all();

    if (!entry) {
      // Unreachable with a conforming driver; a throw here rolls the row back
      // rather than returning a result whose entry id is a lie.
      throw new Error("outbox insert returned no row — the write was rolled back");
    }

    return { row, entryId: entry.id };
  });
}
