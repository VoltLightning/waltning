/**
 * The dialect kit — the shared column *vocabulary* for the tables that exist on
 * both engines.
 *
 * `architecture/14` §14.7: Postgres is authoritative, the phone runs SQLite, and
 * roughly thirteen tables exist in both. Drizzle has no cross-dialect schema
 * type — `pg-core` and `sqlite-core` are separate modules with separate builder
 * classes — so the difference has to live somewhere. It lives here, and it is
 * deliberately narrow: what a shared column *means* on each engine, and nothing
 * about which columns exist.
 *
 * **A single definition parameterised over this kit was tried first, and does
 * not work.** The obvious shape —
 *
 * ```ts
 * function currenciesTable<K extends Kit>(k: K) { return k.table("currencies", { ... }) }
 * ```
 *
 * — fails to compile, and the reason is structural rather than fixable:
 * TypeScript typechecks a generic function's body against the *constraint*, not
 * against each instantiation. Inside the body `k.text` is
 * `PgTextBuilder | SQLiteTextBuilder`, a union of incompatible signatures, and
 * a union of signatures is not callable. Loosening the constraint until the
 * body compiles is worse, not better: the return type is computed from the same
 * loose types, so `$inferSelect` collapses and the whole thing keeps compiling
 * while proving nothing. Making it work needs higher-kinded types, which the
 * language does not have.
 *
 * So the tables are written twice — `currencies.pg.ts` and
 * `currencies.sqlite.ts` — and `parity.type-test.ts` makes divergence a
 * **compile error** rather than something a reviewer might notice. What the kit
 * still removes is the part that was actually worth removing: the type
 * decisions. That money is a string on both engines, that a SQLite boolean is
 * an integer in `boolean` mode, that the conflict token is a `bigint` here and
 * an integer there — each is decided once, here, rather than in thirteen pairs
 * of files.
 *
 * What does *not* belong here: anything only one engine has. Generated columns,
 * `EXCLUDE`, roles and deferred constraint triggers stay in `packages/db`,
 * layered around the shared tables rather than inside them — §14.7's rule.
 */

import {
  bigint as pgBigint,
  boolean as pgBoolean,
  integer as pgInteger,
  pgTable,
  text as pgText,
  timestamp as pgTimestamp,
  uniqueIndex as pgUniqueIndex,
} from "drizzle-orm/pg-core";
import {
  integer as sqliteInteger,
  sqliteTable,
  text as sqliteText,
  uniqueIndex as sqliteUniqueIndex,
} from "drizzle-orm/sqlite-core";

/**
 * **Money is a string on both engines, and that is what makes the parity
 * assertion possible at all.**
 *
 * Postgres stores `numeric(20,8)` and the driver is configured to hand it back
 * as a string — `CLAUDE.md`'s "money is `numeric(20,8)` strings end to end", and
 * the reason `createDb()` exists rather than a bare `drizzle()` call. SQLite has
 * no exact decimal type at all, so it stores TEXT.
 *
 * Different storage, identical row type. The storage difference is real and
 * costs nothing at the type level, which is the §14.7 claim in its smallest
 * form.
 */
export const pgKit = {
  table: pgTable,
  uniqueIndex: pgUniqueIndex,
  text: pgText,
  integer: pgInteger,
  boolean: pgBoolean,
  money: (name: string) => pgText(name),
  /** `bigint` with `mode: "number"` — §14.2's conflict token. */
  version: (name: string) => pgBigint(name, { mode: "number" }),
  timestamp: (name: string) => pgTimestamp(name, { withTimezone: true }),
} as const;

/**
 * SQLite has no boolean and no timestamptz.
 *
 * `integer({ mode: "boolean" })` and `integer({ mode: "timestamp" })` are
 * Drizzle's own mappings and produce `boolean` and `Date` in the row type —
 * the same TypeScript types the Postgres columns produce. The storage differs;
 * the contract does not.
 */
export const sqliteKit = {
  table: sqliteTable,
  uniqueIndex: sqliteUniqueIndex,
  text: sqliteText,
  integer: sqliteInteger,
  boolean: (name: string) => sqliteInteger(name, { mode: "boolean" }),
  money: (name: string) => sqliteText(name),
  version: (name: string) => sqliteInteger(name, { mode: "number" }),
  timestamp: (name: string) => sqliteInteger(name, { mode: "timestamp" }),
} as const;

export type PgKit = typeof pgKit;
export type SqliteKit = typeof sqliteKit;
