/**
 * Reading `drizzle/replica` and `drizzle/outbox` into steps — the one place
 * that turns a `.sql` file on disk into the `{ tag, statements }` pair the
 * phone ships.
 *
 * **Separate from `embed-ddl.ts` because it has a second reader.**
 * `embed-ddl.ts` writes `src/ddl.ts` at generate time and has a top-level
 * side effect for that reason; a test that wants to know whether the
 * committed `ddl.ts` still matches the committed `.sql` files cannot import
 * that file without rewriting the repository as it runs. This module has no
 * side effect at all, so `src/test/migrate.test.ts` can ask it the one
 * question that matters after a step has shipped — *do these statements still
 * hash to what the chain claims?* — and a second, hand-maintained copy of the
 * splitting rules (the thing the two representations would then drift
 * against) never has to exist.
 *
 * Nothing here reaches the device: `packages/ledger/src` may not name a Node
 * API, and this is `tools/`.
 */

import { readdirSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

/** drizzle-kit's separator. Statements, not lines: `CREATE TABLE` spans many. */
const BREAKPOINT = "--> statement-breakpoint";

/** The bookend pragma a rebuild file wraps itself in — meaningless where `migrate.ts` runs it (see `embed-ddl.ts`'s header) and stripped rather than shipped as a no-op. */
const FOREIGN_KEYS_PRAGMA = /^PRAGMA\s+foreign_keys\s*=/i;

export type Step = {
  readonly tag: string;
  readonly statements: readonly string[];
};

/** One `.sql` file, `--> statement-breakpoint`-split, comments and trailing `;` stripped, foreign-key bookends dropped. */
export function statementsOf(text: string): string[] {
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
export function filesIn(dir: URL): string[] {
  const files = readdirSync(dir)
    .filter((name) => name.endsWith(".sql"))
    .sort();
  if (files.length === 0) throw new Error(`no .sql files in ${fileURLToPath(dir)} — run generate`);
  return files;
}

/** A generated file's own tag — `0006_schema.sql` becomes `0006_schema`, the key `migrate.ts`'s `*_BACKFILLS` looks a step's hand-written backfill up by, and the key its journal row carries. */
export function tagOf(file: string): string {
  return file.replace(/\.sql$/, "");
}

/** Every `.sql` in one migration directory, in filename order — one step per file, nothing derived from what a file contains. */
export function stepsIn(dir: URL): Step[] {
  return filesIn(dir).map((file) => ({
    tag: tagOf(file),
    statements: statementsOf(readFileSync(new URL(file, `${dir.href}/`), "utf8")),
  }));
}
