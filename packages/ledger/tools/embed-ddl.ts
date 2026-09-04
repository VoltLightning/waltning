/**
 * Turn the generated `.sql` files into a TypeScript module the phone can ship.
 *
 * **The step exists because the device has no filesystem this module may
 * name.** `packages/db` runs `drizzle-kit migrate`, which reads `drizzle/*.sql`
 * off disk at migration time; the phone cannot. `expo-file-system` is a
 * platform package `packages/ledger` must not import (`open.ts` gives the same
 * argument for the driver), Metro has no `?raw` import for `.sql`, and a
 * bundler that could inline it would be a second build path to keep honest.
 * A `.ts` file of string literals is the one artefact every bundler already
 * understands.
 *
 * So the SQL is generated, committed, **and** embedded — and `src/ddl.ts` is
 * output, not source. `migrate.test.ts` asserts that a database migrated from
 * it holds exactly the tables and columns the schema modules declare, because
 * output that nobody regenerated is otherwise invisible: every test would run
 * against tables drizzle built from the objects, and the phone would build
 * something older.
 *
 * Run through `pnpm --filter @waltning/ledger generate`, never on its own —
 * embedding without regenerating just re-writes yesterday's DDL.
 *
 * **A replica migration file that rebuilds an existing table ships under its
 * own tag in `REPLICA_REBUILDS`, not folded into `REPLICA_DDL` (M2).** SQLite
 * has no `ALTER TABLE … ADD CONSTRAINT`, so drizzle-kit's only way to add one
 * — a `CHECK`, most often — to a table that already has rows is
 * copy-rename-drop: `CREATE TABLE __new_<table>`, `INSERT INTO __new_<table>
 * SELECT … FROM <table>`, `DROP TABLE <table>`, `ALTER TABLE __new_<table>
 * RENAME TO <table>`. Folding that into `REPLICA_DDL` — which `migrate.ts`'s
 * version-1 `up` runs top to bottom on a blank database — is exactly right
 * for a fresh install and exactly wrong for a phone already at version 1: the
 * module's only lever for a version mismatch there is *drop the whole replica
 * and refetch* (`architecture/08`), which an offline-only phone (`canRefetch:
 * false`) has no second half of, so the new constraint would simply never
 * reach it. A rebuild file's own statements — `__new_` is drizzle-kit's own
 * marker for the pattern, detected here rather than assumed of one position
 * in the directory — go into `REPLICA_REBUILDS[tag]` instead, keyed by the
 * file's own tag (`0007_schema`, not a generated identifier) so
 * `migrate.ts`'s `REPLICA_MIGRATIONS` looks a step's rebuild up by string
 * rather than importing a name this script chose. One `REPLICA_MIGRATIONS`
 * entry can then run it **in place** against an already-populated table
 * (`migrate.ts`'s `inPlace` flag) without dropping anything. Its bookend
 * `PRAGMA foreign_keys` toggle is stripped: that pragma is a no-op once a
 * transaction is already open, which is exactly where `migrate.ts` runs every
 * step, so the toggle that actually matters is the one the migrator itself
 * applies *before* opening it.
 *
 * **A rebuild drops every index the table it copies had (H1).** `DROP TABLE`
 * drops the indexes declared against it, and nothing declared them against
 * `__new_<table>` — so without help the renamed table comes back bare. The
 * fix reads generic rather than naming a table: after a rebuild's own
 * statements, this script asks the schema module which table was just
 * rebuilt (`getTableConfig` off `schema-map.ts`, matched by name) and emits
 * `CREATE INDEX IF NOT EXISTS` for every index that table declares, built
 * from the same `Index` objects drizzle-kit itself reads — not a hand-kept
 * list beside it that the next index declared on that table would silently
 * miss.
 */

import { readdirSync, readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { getTableName, is, type SQL } from "drizzle-orm";
import {
  getTableConfig,
  type Index,
  type IndexColumn,
  SQLiteColumn,
  SQLiteSyncDialect,
  type SQLiteTable,
} from "drizzle-orm/sqlite-core";
import { ledgerSchema } from "../src/schema-map.ts";

/** drizzle-kit's separator. Statements, not lines: `CREATE TABLE` spans many. */
const BREAKPOINT = "--> statement-breakpoint";

/** drizzle-kit's own marker for a copy-rename-drop table rebuild. */
const REBUILD_MARKER = "__new_";

/** The bookend pragma a rebuild file wraps itself in — meaningless where `migrate.ts` runs it (see this file's header) and stripped rather than shipped as a no-op. */
const FOREIGN_KEYS_PRAGMA = /^PRAGMA\s+foreign_keys\s*=/i;

/** One `.sql` file, `--> statement-breakpoint`-split, comments and trailing `;` stripped. */
function statementsOf(text: string): string[] {
  const statements: string[] = [];
  for (const chunk of text.split(BREAKPOINT)) {
    // Comment-only lines are stripped: the hand-written file explains itself
    // at length, and none of that belongs in a bundle. A trailing `;` goes
    // too — SQLite's `run` takes one statement and drizzle passes it through.
    const statement = chunk
      .split("\n")
      .filter((line) => !line.trimStart().startsWith("--"))
      .join("\n")
      .trim()
      .replace(/;$/, "");
    if (statement.length > 0) statements.push(statement);
  }
  return statements;
}

/** Every `.sql` in one migration directory, in filename order — flat, no rebuild split. Used for the outbox, whose own doc (`architecture/08` item 2) is why it never needs one: its table shape never changes with the domain. */
function statementsIn(dir: URL): string[] {
  const files = filesIn(dir);
  return files.flatMap((file) => statementsOf(readFileSync(new URL(file, `${dir.href}/`), "utf8")));
}

/**
 * Filename order, not `meta/_journal.json` order, deliberately: the journal
 * describes what drizzle-kit generated, and the hand-written
 * `0001_database_objects.sql` is listed there only because this repo puts it
 * there for `packages/db`'s benefit. Sorting the directory means a companion
 * file cannot be silently left out of the chain by a journal edit.
 */
function filesIn(dir: URL): string[] {
  const files = readdirSync(dir)
    .filter((name) => name.endsWith(".sql"))
    .sort();
  if (files.length === 0) throw new Error(`no .sql files in ${fileURLToPath(dir)} — run generate`);
  return files;
}

/** A generated file's own tag — `0007_schema.sql` becomes `0007_schema`, the `REPLICA_REBUILDS` key `migrate.ts` looks a step's rebuild up by. */
function tagOf(file: string): string {
  return file.replace(/\.sql$/, "");
}

/**
 * The table a rebuild file's closing `RENAME TO` names — the table it just
 * finished copy-rename-dropping, and so the table whose indexes were just
 * dropped with it (H1).
 */
function rebuiltTableName(text: string): string {
  const match = text.match(/`__new_[A-Za-z0-9_]+`\s+RENAME TO\s+`([A-Za-z0-9_]+)`/i);
  if (!match) {
    throw new Error(
      "a rebuild file (containing `__new_`) must end in `ALTER TABLE … RENAME TO` — none found",
    );
  }
  return match[1] ?? "";
}

/** Every replica table `schema-map.ts` declares, as one array `getTableConfig` can read off. */
const schemaTables: readonly SQLiteTable[] = Object.values(ledgerSchema);

const dialect = new SQLiteSyncDialect();

/**
 * One `IndexColumn` — a plain column, or a `sql` expression such as
 * `counterparties_name_uq`'s `lower(trim(name))` — as the text that belongs
 * inside a `CREATE INDEX`'s parentheses.
 *
 * `"indexes"` is drizzle-orm's own `invokeSource` for this: a bare column
 * inside it renders as its own name, unqualified, rather than
 * `table.column` — the only form valid inside an index definition, and the
 * same rendering drizzle-kit's generator relies on.
 */
function indexColumnSql(column: IndexColumn): string {
  if (is(column, SQLiteColumn)) return dialect.escapeName(column.name);
  // `IndexColumn` is `SQLiteColumn | SQL`; the branch above excludes the
  // first by value, but its generic defaults differ from `IndexColumn`'s own
  // member enough that `is`'s type predicate does not narrow the union here.
  return sqlExpression(column as SQL);
}

/** An `SQL` fragment as literal text — refused if it would need a bound parameter, which `CREATE INDEX` cannot take. */
function sqlExpression(fragment: SQL): string {
  const { sql, params } = dialect.sqlToQuery(fragment, "indexes");
  if (params.length > 0) {
    throw new Error(
      `an index expression rendered a bound parameter ("${sql}") — CREATE INDEX has no values to bind it to; use a literal instead`,
    );
  }
  return sql;
}

/**
 * `CREATE INDEX IF NOT EXISTS …` for one declared `Index`, built from the
 * same `IndexConfig` drizzle-kit reads — not a copy of the SQL text drizzle-kit
 * would generate, which this script has no access to, but new text from the
 * same source of truth. `IF NOT EXISTS` is what makes it a no-op on any
 * install this table's rebuild reaches more than once (H1's own drift test
 * runs both the fresh and the v1→v2 path over it).
 */
function createIndexStatement(tableName: string, index: Index): string {
  const { name, unique, columns, where } = index.config;
  const columnsSql = columns.map(indexColumnSql).join(", ");
  const whereSql = where ? ` WHERE ${sqlExpression(where)}` : "";
  return `CREATE ${unique ? "UNIQUE " : ""}INDEX IF NOT EXISTS ${dialect.escapeName(name)} ON ${dialect.escapeName(tableName)} (${columnsSql})${whereSql}`;
}

/** Every index the schema module declares for one table, as `CREATE INDEX IF NOT EXISTS` statements — what a rebuild of that table must recreate (H1). */
function recreatedIndexesFor(tableName: string): string[] {
  const table = schemaTables.find((t) => getTableName(t) === tableName);
  if (!table) {
    throw new Error(
      `a rebuild targets "${tableName}", which no table in schema-map.ts declares — is it in \`ledgerSchema\`?`,
    );
  }
  return getTableConfig(table).indexes.map((index) => createIndexStatement(tableName, index));
}

type ReplicaSplit = {
  /** Every ordinary file's statements, in one flat array — `REPLICA_MIGRATIONS`' version-1 `up`. */
  base: string[];
  /** One entry per rebuild file, in filename order — each its own later `REPLICA_MIGRATIONS` version, keyed by tag in `REPLICA_REBUILDS`. */
  rebuilds: { tag: string; statements: string[] }[];
};

function splitReplica(dir: URL): ReplicaSplit {
  const base: string[] = [];
  const rebuilds: ReplicaSplit["rebuilds"] = [];
  for (const file of filesIn(dir)) {
    const text = readFileSync(new URL(file, `${dir.href}/`), "utf8");
    const statements = statementsOf(text);
    if (text.includes(REBUILD_MARKER)) {
      const tableName = rebuiltTableName(text);
      rebuilds.push({
        tag: tagOf(file),
        statements: [
          ...statements.filter((s) => !FOREIGN_KEYS_PRAGMA.test(s.trim())),
          ...recreatedIndexesFor(tableName),
        ],
      });
    } else {
      base.push(...statements);
    }
  }
  return { base, rebuilds };
}

/**
 * One statement as a template literal.
 *
 * A template literal rather than `JSON.stringify`, so the committed file reads
 * as SQL and a reviewer can compare it to the `.sql` beside it without
 * unescaping newlines. The escapes are the cost: drizzle-kit quotes identifiers
 * with backticks, which is exactly the character a template literal ends on.
 */
function literal(statement: string): string {
  return `\`${statement.replace(/\\/g, "\\\\").replace(/`/g, "\\`").replace(/\$\{/g, "\\${")}\``;
}

function block(name: string, doc: string, statements: readonly string[]): string {
  const body = statements.map((s) => `  ${literal(s)},`).join("\n");
  return `${doc}\nexport const ${name}: readonly string[] = [\n${body}\n];\n`;
}

/**
 * Every rebuild file, keyed by tag (M2) — one object rather than one export
 * per file, so `migrate.ts` looks a step's rebuild up by the string its own
 * `REPLICA_MIGRATIONS` entry names, never by importing an identifier this
 * script generated. `test/migrate.test.ts` asserts every key here has a
 * `REPLICA_MIGRATIONS` entry that runs it — a rebuild file nobody's chain
 * references never reaches an installed phone.
 */
function rebuildsBlock(rebuilds: ReplicaSplit["rebuilds"]): string {
  const doc = `/** Every table-rebuild file (M2), keyed by tag — \`migrate.ts\`'s \`REPLICA_MIGRATIONS\` runs one by looking its tag up here. */`;
  const entries = rebuilds
    .map(({ tag, statements }) => {
      const body = statements.map((s) => `    ${literal(s)},`).join("\n");
      return `  ${JSON.stringify(tag)}: [\n${body}\n  ],`;
    })
    .join("\n");
  return `${doc}\nexport const REPLICA_REBUILDS: Readonly<Record<string, readonly string[]>> = {\n${entries}\n};\n`;
}

const HEADER = `/**
 * The DDL the phone runs, generated from the concrete SQLite table modules,
 * \`src/local-meta.ts\`, and \`src/outbox.ts\`.
 *
 * **Do not edit.** Change a table, run \`pnpm ledger:generate\`, commit both this
 * file and the \`drizzle/\` output it was built from. \`migrate.test.ts\` asserts a
 * database migrated from this file holds exactly the tables and columns those
 * schema modules declare, so a stale copy is a red test rather than a phone
 * that is quietly a version behind.
 *
 * This is what replaced a runtime emitter that walked drizzle's table objects
 * and rebuilt columns, affinities, \`primary key\` and \`not null\` by hand.
 * Everything else a table declared — foreign keys, \`CHECK\`s, indexes, partial
 * unique indexes — was dropped silently on the way to the device, which is
 * worse than never declaring it: \`architecture/14\` §14.6 requires the phone to
 * refuse at capture time what the server would refuse, and every one of those
 * refusals is a constraint that emitter did not emit. \`outbox.ts\` declares
 * \`index("outbox_pending_by_seq")\` and the phone did not have it.
 *
 * \`REPLICA_REBUILDS\`, when it holds an entry, keys a migration file that
 * rebuilds an existing table rather than only adding to the schema —
 * \`tools/embed-ddl.ts\`'s own header says why it ships apart from
 * \`REPLICA_DDL\`, and \`migrate.ts\`'s \`REPLICA_MIGRATIONS\` is what turns a tag
 * into its own version. Each entry's own trailing statements recreate every
 * index the rebuilt table declares (H1) — \`DROP TABLE\` takes them with it,
 * and nothing declared them against the copy that replaces it.
 */
`;

const here = new URL(".", import.meta.url);
const out = new URL("../src/ddl.ts", here);

const replica = splitReplica(new URL("../drizzle/replica", here));

const file = [
  HEADER,
  block(
    "REPLICA_DDL",
    `/** The fifteen shared tables, plus \`local_meta\` and its one row. */`,
    replica.base,
  ),
  rebuildsBlock(replica.rebuilds),
  block(
    "OUTBOX_DDL",
    `/** The queue, its index, and the counter \`claimSeq\` allocates from. */`,
    statementsIn(new URL("../drizzle/outbox", here)),
  ),
].join("\n");

writeFileSync(out, file);
console.log(`wrote ${fileURLToPath(out)}`);
