import { sql } from "drizzle-orm";
import { currencies } from "./currencies.sqlite.ts";
import { COUNTERPARTY_KIND } from "./enums.ts";
import { sqliteKit as k } from "./kit.ts";

/**
 * The unique index on `name_folded` is Postgres's too, in `packages/db`
 * (`counterparties_name_uq`, partial where `not archived`) — except here it
 * isn't only Postgres's.
 *
 * **This table is the one exception to "constraints stay in `packages/db`."**
 * Every other shared table's SQLite half is bare — `k.table(name, columns())`,
 * no third argument — because the phone has no separate composition layer the
 * way Postgres does, so a constraint declared here is the *only* copy that
 * ever runs; `packages/db` adds its own independently. That asymmetry is fine
 * where a collision is merely wasted effort (two `Tag` rows spelled
 * differently). It is not fine here: S15's whole guard is that two spellings
 * of one person cannot both exist, and `create_counterparty`'s executor can
 * only refuse a collision against *rows this replica already has* — it cannot
 * see a duplicate the server would refuse tomorrow, and until a real index
 * backs it, two offline creates of the same person both land.
 *
 * **`name_folded` is a stored column, not an expression index (R2 C1).** An
 * expression index over `lower(trim(name))` was tried first, and SQLite's
 * `lower()` is ASCII-only — `ŁUKASZ` and `łukasz` fold to two different
 * strings on the phone and only collide once Postgres's locale-aware
 * `lower()` sees them at drain. `fold()` (`@waltning/core/capture/names`,
 * case-fold plus the nine Polish diacritics) runs in JavaScript at write
 * time instead, on both engines, so the two spellings are the same folded
 * string before either index ever sees them.
 *
 * **Postgres computes this column now (`GENERATED ALWAYS AS (…) STORED`,
 * `packages/db/src/schema.ts`, R2 H2); this one stays app-written.** Not an
 * oversight — SQLite has no portable equivalent of Postgres's `translate()`,
 * which the fold expression needs for the nine Polish diacritics, so a
 * `GENERATED ALWAYS AS` expression here would need a custom scalar function
 * registered on the connection, invisible to `drizzle-kit`'s plain-SQL
 * migration diffing and to `packages/ledger/tools/embed-ddl.ts`, which only
 * ever reproduces columns, affinities, `primary key` and `not null` from
 * that SQL. `create_counterparty`/`update_counterparty` writing it directly
 * — the same `fold()` Postgres's generated expression mirrors — is what
 * keeps the two engines in agreement without a JS function neither
 * `drizzle-kit` nor the DDL embedder can see.
 */
export const counterpartiesColumns = () => ({
  id: k.id<"counterparties">("id"),
  name: k.text("name").notNull(),
  /**
   * `fold(name)` — see above. Written by `create_counterparty`/
   * `update_counterparty`, never derived by a query. The `''` default exists
   * for one reason: SQLite refuses `ADD COLUMN … NOT NULL` without one on a
   * table that has rows, so the migration step that introduces this column
   * could not run on a phone that already holds counterparties.
   *
   * **R4 M3 — the column and the unique index on it are two separate
   * migrations, deliberately, and a JS backfill runs between them.**
   * `replica/0006_schema.sql` only adds this column, every existing row
   * still holding `''`; `replica/0007_schema.sql` is the one that drops the
   * old `lower(trim(name))` index and creates the new unique index on this
   * column. Bundled into one file — as this used to be — a phone with two or
   * more live counterparties would fail its own migration: every row reads
   * `''` the instant the column exists, and a unique index created in that
   * same breath collides with itself before anything has had a chance to
   * backfill a real value. The backfill itself is a follow-up PR's, not this
   * migration's — it runs as ordinary application code after 0006 applies
   * and before 0007 does, writing `fold(name)` into every row.
   */
  nameFolded: k.text("name_folded").notNull().default(""),
  kind: k.text("kind", { enum: COUNTERPARTY_KIND }).notNull().default("person"),
  settlementCurrency: k.currency("settlement_currency").references(() => currencies.code),
  contact: k.text("contact"),
  note: k.text("note").notNull().default(""),
  defaultActivity: k.text("default_activity"),
  archived: k.boolean("archived").notNull().default(false),
  sort: k.integer("sort").notNull().default(0),
  createdAt: k.stamp("created_at"),
  updatedAt: k.stamp("updated_at"),
  version: k.version("version").notNull().default(1),
});

export const counterparties = k.table("counterparties", counterpartiesColumns(), (t) => [
  // M3 — an archived counterparty's old name must not block a fresh one from
  // taking it; history stays under the old row regardless (§9.2).
  k.uniqueIndex("counterparties_name_uq").on(t.nameFolded).where(sql`not ${t.archived}`),
]);
