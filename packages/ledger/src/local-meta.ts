/**
 * The replica's meta store — one row, holding `applied_seq`.
 *
 * **The watermark: the highest outbox `seq` whose effect is present in the
 * local tables.** The two stores are two files and WAL gives no atomicity
 * across them (`open.ts`), so a capture commits its outbox entry first and its
 * replica row second, and a kill between the two leaves an entry whose effect
 * is not on the ledger. Advancing this **in the same transaction as the row it
 * describes** is what closes that: the watermark and the row are in one file,
 * so *that* pair is genuinely atomic even though the cross-file pair is not.
 * At launch, entries with `seq > applied_seq` are replayed.
 *
 * **It lives in the replica, not the outbox, for exactly that reason** — it is
 * a statement about what the replica contains, and a statement about a file has
 * to be committed with that file or it is a second source of truth.
 *
 * **Not `PRAGMA user_version`.** That is already the schema version, and the
 * two facts have opposite lifecycles: one changes on an app update, the other
 * on every capture. Sharing a slot would make each capture look like a schema
 * change.
 *
 * **A drizzle table now, where it used to be literal DDL in `migrate.ts`.**
 * That exception existed because the old runtime emitter dropped every
 * constraint on the way to the device, and `check ("id" = 1)` is the whole
 * point of this table: `CLAUDE.md` asks that a guarantee be a constraint rather
 * than only code, and a check on a primary key is what makes "one row" true
 * instead of merely intended — a second row must reuse id 1 and collides.
 * drizzle-kit emits the check, so the table can be declared where every other
 * table is declared and the exception is gone.
 *
 * It has no Postgres counterpart and is deliberately not in `packages/schema`,
 * for the reason `outbox.ts` gives about itself: inventing one would put a
 * table on the server whose only purpose is to make a parity assertion pass —
 * and `parity.type-test.ts` asserts the two table sets are *exactly* equal, so
 * adding it there would fail in three places.
 *
 * The row itself is not here. A generator writes DDL and this table needs a
 * `INSERT`, which is why `drizzle/replica/0001_database_objects.sql` exists —
 * the same generated/hand-written split `packages/db` runs on Postgres.
 */

import { sql } from "drizzle-orm";
import { check, integer, sqliteTable } from "drizzle-orm/sqlite-core";

export const localMeta = sqliteTable(
  "local_meta",
  {
    /** Always `1`. A primary key over a single row is how "there is one" is said in SQL. */
    id: integer("id").primaryKey(),
    /** The highest outbox `seq` whose effect is present in the tables beside it. */
    appliedSeq: integer("applied_seq").notNull().default(0),
  },
  (table) => [check("local_meta_single_row", sql`${table.id} = 1`)],
);
