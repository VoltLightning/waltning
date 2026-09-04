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
 */

import { readdirSync, readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

/** drizzle-kit's separator. Statements, not lines: `CREATE TABLE` spans many. */
const BREAKPOINT = "--> statement-breakpoint";

/**
 * Every `.sql` in one migration directory, in filename order.
 *
 * Filename order rather than `meta/_journal.json` order, deliberately: the
 * journal describes what drizzle-kit generated, and the hand-written
 * `0001_database_objects.sql` is listed there only because this repo puts it
 * there for `packages/db`'s benefit. Sorting the directory means a companion
 * file cannot be silently left out of the chain by a journal edit.
 */
function statementsIn(dir: URL): string[] {
  const files = readdirSync(dir)
    .filter((name) => name.endsWith(".sql"))
    .sort();
  if (files.length === 0) throw new Error(`no .sql files in ${fileURLToPath(dir)} — run generate`);

  const statements: string[] = [];
  for (const file of files) {
    const text = readFileSync(new URL(file, `${dir.href}/`), "utf8");
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
  }
  return statements;
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
 */
`;

const here = new URL(".", import.meta.url);
const out = new URL("../src/ddl.ts", here);

const file = [
  HEADER,
  block(
    "REPLICA_DDL",
    `/** The fifteen shared tables, plus \`local_meta\` and its one row. */`,
    statementsIn(new URL("../drizzle/replica", here)),
  ),
  block(
    "OUTBOX_DDL",
    `/** The queue, its index, and the counter \`claimSeq\` allocates from. */`,
    statementsIn(new URL("../drizzle/outbox", here)),
  ),
].join("\n");

writeFileSync(out, file);
console.log(`wrote ${fileURLToPath(out)}`);
