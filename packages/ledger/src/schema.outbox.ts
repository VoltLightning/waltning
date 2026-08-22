/**
 * The outbox database's schema — the queue, and the counter `seq` is handed out
 * from.
 *
 * Two tables and no more, and that is the file boundary §5.7 draws: `outbox.db`
 * holds intent that exists nowhere else, so it is the one store that is never
 * dropped. See `schema.replica.ts` for why the two are separate modules rather
 * than one barrel with a comment.
 *
 * The definitions themselves stay in `outbox.ts`, beside `claimSeq` and
 * `deriveDeps` — the reasoning about monotonicity is about the table and the
 * function together, and splitting them would leave the argument half in each.
 * This module exists so drizzle-kit can be pointed at exactly the tables that
 * belong in this database.
 */

export { outbox, outboxSeq } from "./outbox.ts";
