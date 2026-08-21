/**
 * A scratch phone database, in memory.
 *
 * **`better-sqlite3`, not `expo-sqlite`.** The device driver cannot run under
 * Node — it needs the Expo native runtime — and the property under test is
 * atomicity, so the harness must have *real* transactions. `sqlite-proxy` was
 * the obvious zero-dependency option and is wrong for exactly that reason: it
 * has no transaction support, so a test written against it would report success
 * on a write path that commits in two pieces.
 *
 * Both drivers speak the same drizzle SQLite dialect over the same schema, so
 * what is exercised here is the write path rather than the driver.
 *
 * **The tables are created from the schema, not from a migration file.** The
 * phone's migrator is its own card; generating DDL from the same definitions the
 * code queries means this harness cannot drift from them, and a migration set
 * that has to match will be checked against these tables when it arrives.
 */

import Database from "better-sqlite3";
import { getTableColumns, getTableName, is, sql } from "drizzle-orm";
import { drizzle } from "drizzle-orm/better-sqlite3";
import { type SQLiteColumn, SQLiteTable } from "drizzle-orm/sqlite-core";
import * as schema from "../schema.ts";

export type Scratch = ReturnType<typeof scratchLedger>;

/** The SQLite type for a column, from what drizzle already knows about it. */
function columnType(column: SQLiteColumn): string {
  const kind = column.getSQLType().toLowerCase();
  if (kind.includes("int")) return "integer";
  if (kind.includes("real") || kind.includes("float") || kind.includes("double")) return "real";
  if (kind.includes("blob")) return "blob";
  return "text";
}

/**
 * `CREATE TABLE` for one drizzle table.
 *
 * **`getTableColumns`, not `getTableConfig`.** The latter takes
 * `SQLiteTable<TableConfig>`, and a concrete drizzle table is not assignable to
 * it under this repo's `exactOptionalPropertyTypes` — the concrete type has
 * `schema: undefined` where the config declares `schema?: string`. That is a
 * known friction between drizzle and the flag, and the alternative was a cast
 * at exactly the point where a wrong table would go unnoticed.
 *
 * The cost is that composite primary keys are not reproduced. None of the
 * thirteen declares one in its shared columns — `transaction_tags`' pair is a
 * `unique` constraint that lives in `packages/db` — so nothing is lost today,
 * and the phone's real DDL comes from the migrator card rather than from here.
 *
 * Foreign keys are **declared and not enforced**: `PRAGMA foreign_keys` is off
 * by default in SQLite and stays off, because the device turns it on
 * per-connection and a harness enforcing them would be testing a stricter
 * database than the one that ships.
 */
function createTable<T extends SQLiteTable>(table: T): string {
  const columns = Object.values(getTableColumns(table)).map((c: SQLiteColumn) => {
    const parts = [`"${c.name}"`, columnType(c)];
    if (c.primary) parts.push("primary key");
    if (c.notNull && !c.primary) parts.push("not null");
    return parts.join(" ");
  });

  return `create table "${getTableName(table)}" (${columns.join(", ")})`;
}

function isTable(value: unknown): value is SQLiteTable {
  return is(value, SQLiteTable);
}

export function scratchLedger() {
  const sqlite = new Database(":memory:");
  const db = drizzle(sqlite, { schema });

  // Widened to `unknown[]` **before** filtering, and that is the point rather
  // than a formality. A type predicate applied to a union narrows to the
  // concrete members — `SQLiteTableWithColumns<{ name: "accounts"; … }>` — and
  // those are not assignable to `SQLiteTable` under this repo's
  // `exactOptionalPropertyTypes`, because the concrete type has
  // `schema: undefined` where the declaration says `schema?: string`.
  //
  // Widening is sound in the direction it goes: it throws information away and
  // the predicate puts back exactly what is needed.
  const tables = (Object.values(schema) as unknown[]).filter(isTable);
  if (tables.length < 13) {
    // Non-vacuous: a barrel that stopped exporting tables would otherwise give
    // every test an empty database and a green suite.
    throw new Error(`expected the thirteen shared tables and the outbox, found ${tables.length}`);
  }
  for (const table of tables) db.run(sql.raw(createTable(table)));

  return {
    db,
    /** The raw handle, for asserting on what is actually stored. */
    sqlite,
    close: () => sqlite.close(),
  };
}

/**
 * The transaction handle this harness's database hands to a callback.
 *
 * Derived from `scratchLedger` rather than written out, so a test cannot pin a
 * shape the driver does not actually produce — and so nothing here has to name
 * `better-sqlite3`'s own types, which is what forked `drizzle-orm` into two
 * instances the first time round.
 */
export type LedgerTx = Parameters<Parameters<Scratch["db"]["transaction"]>[0]>[0];
