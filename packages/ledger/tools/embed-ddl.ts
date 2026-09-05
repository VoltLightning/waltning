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
 * **Every generated file is its own step, in filename order — one `.sql` file,
 * one entry, nothing derived from its contents.** `REPLICA_STEPS` and
 * `OUTBOX_STEPS` are the whole output for each directory: no splitting a
 * rebuild file away from a plain one, no classifying a step by whether it
 * contains `__new_`, no synthesising the indexes a rebuild's `DROP TABLE`
 * took with it. `migrate.ts` turns each step into the version its own
 * filename names — `0006_schema` is version 7, from the prefix and never
 * from the position — and runs its statements verbatim, then whatever
 * hand-written backfill is registered for that tag. drizzle-kit already
 * emits everything a rebuild needs, indexes included
 * (`prepareSQLiteRecreateTable` ends with `prepareCreateIndexesJson`), so
 * there is nothing left here to reconstruct. A round that tried to (H1's
 * "fix") was reconstructing a premise that was never true.
 *
 * **A rebuild file's `PRAGMA foreign_keys=OFF/ON` bookends are stripped.**
 * SQLite treats `PRAGMA foreign_keys` as a no-op once a transaction is
 * already open, and `migrate.ts` runs every step's statements inside one —
 * so shipping the bookends would ship two statements that do nothing where
 * they land. What actually has to happen — the connection running with
 * foreign keys off for the length of a migration transaction that might
 * rebuild a table another populated table still references — is
 * `migrate.ts`'s job, toggled with the pragma *before* the transaction
 * opens, which is the one place it takes effect. `open.ts`'s `tune()` is
 * what turns `foreign_keys` back on for the replica afterward, once per
 * connection, at open time — the pragma is a connection property, not
 * something a migration's rollback or commit restores on its own.
 */

import { readdirSync, readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

/** drizzle-kit's separator. Statements, not lines: `CREATE TABLE` spans many. */
const BREAKPOINT = "--> statement-breakpoint";

/** The bookend pragma a rebuild file wraps itself in — meaningless where `migrate.ts` runs it (see this file's header) and stripped rather than shipped as a no-op. */
const FOREIGN_KEYS_PRAGMA = /^PRAGMA\s+foreign_keys\s*=/i;

/** One `.sql` file, `--> statement-breakpoint`-split, comments and trailing `;` stripped, foreign-key bookends dropped. */
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
    if (statement.length > 0 && !FOREIGN_KEYS_PRAGMA.test(statement)) statements.push(statement);
  }
  return statements;
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

/** A generated file's own tag — `0006_schema.sql` becomes `0006_schema`, the key `migrate.ts`'s `*_BACKFILLS` looks a step's hand-written backfill up by. */
function tagOf(file: string): string {
  return file.replace(/\.sql$/, "");
}

export type Step = {
  readonly tag: string;
  readonly statements: readonly string[];
};

/** Every `.sql` in one migration directory, in filename order — one step per file, nothing derived from what a file contains. */
function stepsIn(dir: URL): Step[] {
  return filesIn(dir).map((file) => ({
    tag: tagOf(file),
    statements: statementsOf(readFileSync(new URL(file, `${dir.href}/`), "utf8")),
  }));
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

function stepsBlock(name: string, doc: string, steps: readonly Step[]): string {
  const entries = steps
    .map(({ tag, statements }) => {
      const body = statements.map((s) => `      ${literal(s)},`).join("\n");
      return `  {\n    tag: ${JSON.stringify(tag)},\n    statements: [\n${body}\n    ],\n  },`;
    })
    .join("\n");
  return `${doc}\nexport const ${name}: readonly { readonly tag: string; readonly statements: readonly string[] }[] = [\n${entries}\n];\n`;
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
 * **One step per generated file, in filename order, statements verbatim.**
 * \`migrate.ts\` turns each step into \`REPLICA_MIGRATIONS\` /
 * \`OUTBOX_MIGRATIONS\`' version — the file's own four-digit prefix plus one,
 * so \`0006_schema\` is version 7 whatever else the chain holds — and runs
 * its statements, then the hand-written backfill registered under the step's
 * \`tag\`, if there is one (\`REPLICA_BACKFILLS\` / \`OUTBOX_BACKFILLS\`, both
 * in \`migrate.ts\`): the SQL a schema step cannot itself express, such as
 * filling a new column from the rows that already exist. This module does not
 * know which tags have one.
 */
`;

const here = new URL(".", import.meta.url);
const out = new URL("../src/ddl.ts", here);

const file = [
  HEADER,
  stepsBlock(
    "REPLICA_STEPS",
    `/** One step per file in \`drizzle/replica\`, filename order — the fifteen shared tables, \`local_meta\` and its one row, and every schema change since. */`,
    stepsIn(new URL("../drizzle/replica", here)),
  ),
  stepsBlock(
    "OUTBOX_STEPS",
    `/** One step per file in \`drizzle/outbox\`, filename order — the queue, its index, and the counter \`claimSeq\` allocates from. */`,
    stepsIn(new URL("../drizzle/outbox", here)),
  ),
].join("\n");

writeFileSync(out, file);
console.log(`wrote ${fileURLToPath(out)}`);
