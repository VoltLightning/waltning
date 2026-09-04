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
 * **A replica migration file that rebuilds an existing table ships as its
 * own export, not folded into `REPLICA_DDL` (M2).** SQLite has no `ALTER
 * TABLE … ADD CONSTRAINT`, so drizzle-kit's only way to add one — a `CHECK`,
 * most often — to a table that already has rows is copy-rename-drop:
 * `CREATE TABLE __new_<table>`, `INSERT INTO __new_<table> SELECT … FROM
 * <table>`, `DROP TABLE <table>`, `ALTER TABLE __new_<table> RENAME TO
 * <table>`. Folding that into `REPLICA_DDL` — which `migrate.ts`'s version-1
 * `up` runs top to bottom on a blank database — is exactly right for a fresh
 * install and exactly wrong for a phone already at version 1: the module's
 * only lever for a version mismatch there is *drop the whole replica and
 * refetch* (`architecture/08`), which an offline-only phone (`canRefetch:
 * false`) has no second half of, so the new constraint would simply never
 * reach it. A rebuild file's own statements — `__new_` is drizzle-kit's own
 * marker for the pattern, detected here rather than assumed of one position
 * in the directory — become a separate export instead, one `REPLICA_MIGRATIONS`
 * entry can run **in place** against an already-populated table (`migrate.ts`'s
 * `inPlace` flag) without dropping anything. Its bookend `PRAGMA
 * foreign_keys` toggle is stripped: that pragma is a no-op once a
 * transaction is already open, which is exactly where `migrate.ts` runs
 * every step, so the toggle that actually matters is the one the migrator
 * itself applies *before* opening it.
 */

import { readdirSync, readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

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

/** A generated file's own tag, `PascalCase`-free — `0007_schema.sql` becomes `0007_SCHEMA`, folded into the export name below. */
function exportSuffixFor(file: string): string {
  return file.replace(/\.sql$/, "").toUpperCase();
}

type ReplicaSplit = {
  /** Every ordinary file's statements, in one flat array — `REPLICA_MIGRATIONS`' version-1 `up`. */
  base: string[];
  /** One entry per rebuild file, in filename order — each its own later `REPLICA_MIGRATIONS` version. */
  rebuilds: { exportName: string; statements: string[] }[];
};

function splitReplica(dir: URL): ReplicaSplit {
  const base: string[] = [];
  const rebuilds: ReplicaSplit["rebuilds"] = [];
  for (const file of filesIn(dir)) {
    const text = readFileSync(new URL(file, `${dir.href}/`), "utf8");
    const statements = statementsOf(text);
    if (text.includes(REBUILD_MARKER)) {
      rebuilds.push({
        exportName: `REPLICA_DDL_REBUILD_${exportSuffixFor(file)}`,
        statements: statements.filter((s) => !FOREIGN_KEYS_PRAGMA.test(s.trim())),
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
 * A \`REPLICA_DDL_REBUILD_*\` export, when there is one, is a migration file
 * that rebuilds an existing table rather than only adding to the schema —
 * \`tools/embed-ddl.ts\`'s own header says why it ships apart from
 * \`REPLICA_DDL\`, and \`migrate.ts\`'s \`REPLICA_MIGRATIONS\` is what turns it
 * into its own version.
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
  ...replica.rebuilds.map(({ exportName, statements }) =>
    block(
      exportName,
      `/** A table rebuild (M2) — its own \`REPLICA_MIGRATIONS\` version, run in place. */`,
      statements,
    ),
  ),
  block(
    "OUTBOX_DDL",
    `/** The queue, its index, and the counter \`claimSeq\` allocates from. */`,
    statementsIn(new URL("../drizzle/outbox", here)),
  ),
].join("\n");

writeFileSync(out, file);
console.log(`wrote ${fileURLToPath(out)}`);
