/**
 * What "the same schema" means, read back out of the file rather than
 * assumed from the chain that built it.
 *
 * `upgrade.journey.test.ts` needs to compare an upgraded fixture's schema
 * against a fresh install's — and `migrate.test.ts`'s own argument for why a
 * constraint is read out of `sqlite_master` rather than trusted from the
 * generator applies here too: two databases built from the same chain are
 * only provably the same schema if something inspects them and says so.
 *
 * **Normalisation exists because SQLite itself is not byte-stable about a
 * table it did not just create.** A column-add migration (`ALTER TABLE …
 * RENAME TO __new_x`, then rebuild) leaves `sqlite_master.sql` carrying a
 * `__new_` prefix and whatever quoting style the rebuild used, even though
 * the resulting table is identical to one `CREATE TABLE`d fresh. This chain
 * has no such migration yet — every fixture here is a version-1 database
 * that never went through a rebuild — but the normalisation is written now,
 * against the day one exists, rather than the day the comparison starts
 * failing for a reason that has nothing to do with the schema actually
 * differing.
 */

import type Database from "better-sqlite3";

export type SchemaRow = {
  readonly type: string;
  readonly name: string;
  readonly tblName: string;
  readonly sql: string | null;
  /** `pragma table_info`, for a table object; `null` for anything else. */
  readonly tableInfo: readonly Record<string, unknown>[] | null;
  /** `pragma index_list`, for a table object; `null` for anything else. */
  readonly indexList: readonly Record<string, unknown>[] | null;
  /** `pragma foreign_key_list`, for a table object; `null` for anything else. */
  readonly foreignKeyList: readonly Record<string, unknown>[] | null;
  /** `pragma index_xinfo`, for an index object; `null` for anything else. */
  readonly indexXinfo: readonly Record<string, unknown>[] | null;
};

/**
 * A backtick and a double quote, built from a char code rather than written
 * as a literal — not a `/[`"]/` character class. This repo's
 * `tests/unknown-budget.test.ts` strips comments and strings with a regex
 * that has no notion of a character class — a bare backtick or quote sitting
 * inside one pairs itself with an unrelated one elsewhere in the file and
 * deletes everything in between from what it counted. A char code has no
 * mark for it (or for Biome's formatter) to touch.
 */
const BACKTICK = String.fromCharCode(96);
const IDENT_DQUOTE = String.fromCharCode(34);

/** Collapse whitespace, strip identifier quoting, and drop a rebuild's `__new_` prefix. */
function normalizeSql(sql: string | null): string | null {
  if (sql === null) return null;
  return sql
    .replace(/\s+/g, " ")
    .replaceAll(BACKTICK, "")
    .replaceAll(IDENT_DQUOTE, "")
    .replace(/__new_/g, "")
    .trim();
}

type MasterRow = { type: string; name: string; tbl_name: string; sql: string | null };

/**
 * Every `sqlite_master` object, each carrying the pragmas that describe it —
 * sorted, so two databases built in different table orders still compare
 * equal, and JSON-serialisable, so a test can hand it straight to `toEqual`.
 */
export function schemaFingerprint(sqlite: Database.Database): SchemaRow[] {
  const objects = sqlite
    .prepare(`select type, name, tbl_name, sql from sqlite_master where name not like 'sqlite_%'`)
    .all() as MasterRow[];

  const rows: SchemaRow[] = objects.map((object) => {
    const isTable = object.type === "table";
    const isIndex = object.type === "index";
    return {
      type: object.type,
      name: object.name,
      tblName: object.tbl_name,
      sql: normalizeSql(object.sql),
      tableInfo: isTable
        ? (sqlite.prepare(`select * from pragma_table_info(?)`).all(object.name) as Record<
            string,
            unknown
          >[])
        : null,
      indexList: isTable
        ? (sqlite.prepare(`select * from pragma_index_list(?)`).all(object.name) as Record<
            string,
            unknown
          >[])
        : null,
      foreignKeyList: isTable
        ? (sqlite.prepare(`select * from pragma_foreign_key_list(?)`).all(object.name) as Record<
            string,
            unknown
          >[])
        : null,
      indexXinfo: isIndex
        ? (sqlite.prepare(`select * from pragma_index_xinfo(?)`).all(object.name) as Record<
            string,
            unknown
          >[])
        : null,
    };
  });

  return rows.sort((a, b) =>
    a.type === b.type ? a.name.localeCompare(b.name) : a.type.localeCompare(b.type),
  );
}
