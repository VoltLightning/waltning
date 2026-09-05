/**
 * Dumping a populated SQLite file to committable, replayable SQL text.
 *
 * **A fixture is data at a version, not a schema.** `migrate.ts`'s chains
 * already own the DDL — `REPLICA_MIGRATIONS`/`OUTBOX_MIGRATIONS` build every
 * table a fixture could ever hold — so re-stating `CREATE TABLE` here would
 * be a second copy of that generator, and the two would drift the same way
 * `migrate.ts`'s own doc comment describes for the DDL it replaced. Loading a
 * fixture is therefore always the same two steps: run the chain up to the
 * fixture's version, then execute the `INSERT`s this file wrote.
 *
 * **`tools/dump-fixture.ts` is the only caller with a driver.** This module
 * takes an already-open `better-sqlite3` handle rather than a path, so it
 * carries no opinion about how the file was created — the CLI seeds one
 * through the journey harness, `upgrade.journey.test.ts` builds one from a
 * committed fixture, and both hand this the same shape.
 */

import type Database from "better-sqlite3";
import { MIGRATION_JOURNAL } from "../migrate.ts";

/**
 * `"` and `'`, built from a char code rather than written as a literal.
 *
 * Every use below is otherwise a single, unpaired quote mark sitting outside
 * any string this file's own tooling parses as one — a regex literal's
 * `/'/`, a template literal's own delimiter — and this repo's
 * `tests/unknown-budget.test.ts` strips comments and strings with a regex
 * that has no notion of *that* nesting: it matches the *next* quote of the
 * same kind, wherever it falls, and one bare mark here paired itself with an
 * unrelated one elsewhere in the file and deleted everything in between from
 * what it counted. An escaped literal (`"\""`) says the same thing but
 * Biome reformats it back to the bare `'"'` this exists to avoid — a char
 * code is the one spelling neither tool touches.
 */
const DQUOTE = String.fromCharCode(34);
const SQUOTE = String.fromCharCode(39);

/** Quote a SQL identifier, doubling an embedded quote — the only escape a bare identifier needs. */
function quoteIdent(name: string): string {
  return `${DQUOTE}${name.replaceAll(DQUOTE, DQUOTE + DQUOTE)}${DQUOTE}`;
}

/**
 * One column value, as a literal `dumpDatabase` can replay unchanged.
 *
 * Three shapes only: every column this schema declares is `text` or
 * `integer` (`ddl.ts` names no `blob`), so a value read back off
 * `better-sqlite3` is always a string, a number, `bigint`, or `null` — and
 * anything else means a table this function has not been taught about.
 */
function sqlLiteral(value: unknown): string {
  if (value === null || value === undefined) return "NULL";
  if (typeof value === "string") {
    return `${SQUOTE}${value.replaceAll(SQUOTE, SQUOTE + SQUOTE)}${SQUOTE}`;
  }
  if (typeof value === "number") {
    if (!Number.isFinite(value)) {
      throw new Error(`dumpDatabase: cannot dump the non-finite number ${value}`);
    }
    return String(value);
  }
  if (typeof value === "bigint") return value.toString();
  throw new Error(`dumpDatabase: cannot dump a value of type ${typeof value} — teach it a literal`);
}

type NameRow = { name: string };

/**
 * Every user table's rows, as `INSERT` statements — schema-free.
 *
 * `PRAGMA user_version = N;` comes first, so a fixture states its own
 * version rather than the caller having to know it out of band. Tables are
 * walked **in `sqlite_master` order** — the order the DDL created them in,
 * stable across runs of the same chain — and each table's rows are read
 * **in `rowid` order**, so a fixture built by a deterministic seed script
 * (fixed ids, fixed dates, fixed insertion order) dumps to the same bytes
 * every time.
 *
 * **The inserts run inside one transaction with `defer_foreign_keys` on.**
 * `sqlite_master` order is DDL order, not a topological one — `accounts`
 * is declared, and so dumped, before the `currencies` row its own `currency`
 * column references — so replaying the statements one at a time under
 * ordinary foreign-key checking would refuse the second table on the first
 * row. `migrate.ts`'s `dropEverything` names the same fix for the same
 * reason: checks deferred to `COMMIT` see every row this file is about to
 * insert, not just the ones inserted so far.
 *
 * **`INSERT OR REPLACE`, not plain `INSERT`.** A fixture's chain has already
 * run by the time its SQL executes (`ddl.ts`'s `local_meta` row is written by
 * the migration `up` step itself, not by anyone's insert), so a fixture
 * naming that same row's primary key is replacing a row the chain seeded,
 * not colliding with one. Every other table starts empty, where `REPLACE`
 * behaves exactly like `INSERT`.
 *
 * **`__ledger_migrations` is skipped, for the same reason the `CREATE TABLE`s
 * are.** The journal is the chain's own record of itself — which steps ran,
 * and what their statements hashed to — so it is written by the migrator that
 * builds a fixture's tables, exactly as it is on a device, and a copy carried
 * in the `INSERT`s would be a second statement of a fact the chain already
 * makes. It would also be the one non-deterministic column in this file:
 * `applied_at` is a clock reading.
 */
export function dumpDatabase(sqlite: Database.Database): string {
  const [versionRow] = sqlite.prepare("pragma user_version").all() as {
    user_version?: number;
  }[];
  if (typeof versionRow?.user_version !== "number") {
    throw new Error("dumpDatabase: `pragma user_version` returned nothing");
  }

  const tables = sqlite
    .prepare(`select name from sqlite_master where type = 'table' and name not like 'sqlite_%'`)
    .all() as NameRow[];

  const lines: string[] = [
    `PRAGMA user_version = ${versionRow.user_version};`,
    "BEGIN;",
    "PRAGMA defer_foreign_keys = ON;",
  ];

  for (const { name } of tables) {
    if (name === MIGRATION_JOURNAL) continue;
    const columns = (
      sqlite.prepare(`select name from pragma_table_info(?)`).all(name) as NameRow[]
    ).map((c) => c.name);
    if (columns.length === 0) {
      throw new Error(`dumpDatabase: table ${name} reports no columns`);
    }

    const columnList = columns.map(quoteIdent).join(", ");
    const rows = sqlite
      .prepare(`select ${columnList} from ${quoteIdent(name)} order by rowid`)
      .all() as Record<string, unknown>[];

    for (const row of rows) {
      const values = columns.map((column) => sqlLiteral(row[column])).join(", ");
      lines.push(`INSERT OR REPLACE INTO ${quoteIdent(name)} (${columnList}) VALUES (${values});`);
    }
  }

  lines.push("COMMIT;");

  return `${lines.join("\n")}\n`;
}
