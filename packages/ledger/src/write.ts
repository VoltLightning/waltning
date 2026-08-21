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
 * Any synchronous drizzle SQLite database.
 *
 * **One type parameter, inferred, rather than two threaded by hand.** An
 * earlier version carried `TRun` and `TSchema` through `LocalDb`, `LocalTx` and
 * `LocalWrite` — the same constraint restated three times, which is one
 * decision typed out three times and reads as though the file has opinions
 * about six things.
 *
 * `unknown` for the driver's run-result and `Record<string, unknown>` for the
 * schema are both **constraint** positions: this module never touches either,
 * so a narrower bound would be a claim it does not make. Everything downstream
 * is derived from `Db`.
 *
 * Driver-neutral by construction: `better-sqlite3` runs the tests because it
 * has real transactions, `expo-sqlite` runs on the device, and both satisfy
 * this. Naming either would make the driver the thing under test.
 */
export type LocalDb = BaseSQLiteDatabase<"sync", unknown, Record<string, unknown>>;

/**
 * The transaction handle a given database hands to a callback.
 *
 * Recovered from `Db` with `infer` rather than reconstructed from parts. A
 * database created *with* a schema has a different type from one created
 * without, so rebuilding the transaction type by hand means getting both
 * arguments right at every call site — and getting one wrong compiles as a
 * declaration and then refuses every real database.
 */
export type LocalTx<Db extends LocalDb> =
  Db extends BaseSQLiteDatabase<"sync", infer TRun, infer TSchema>
    ? SQLiteTransaction<"sync", TRun, TSchema, ExtractTablesWithRelations<TSchema>>
    : never;

/** What a caller declares about the write it is making. */
export type LocalWrite<Row, Db extends LocalDb> = {
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
  apply: (tx: LocalTx<Db>) => Row;
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
export function writeLocally<Row, Db extends LocalDb>(
  db: Db,
  write: LocalWrite<Row, Db>,
): LocalWriteResult<Row> {
  return db.transaction((tx) => {
    /**
     * **The one cast, and it is the limitation ADR 0001 already records.**
     *
     * TypeScript checks a generic function's body against the *constraint*, not
     * against each instantiation — so inside here `tx` is `LocalTx<LocalDb>`
     * and not `LocalTx<Db>`, however precisely the signature was written. The
     * same wall the schema-kit spike hit: it needs higher-kinded types.
     *
     * Confined to the body deliberately. Every caller reads a signature that is
     * exact, and the only place the compiler cannot follow is four lines long
     * and covered by eight tests.
     */
    const row = write.apply(tx as LocalTx<Db>);

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
