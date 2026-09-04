/**
 * `0010_counterparty_name_folded.sql`'s byte-identity with `schema.ts` — R4
 * L1.
 *
 * `FOLD_SQL` and `JS_TRIM_CHARSET_SQL` (`schema.ts`) are each written once as
 * TypeScript, but they exist a second time as literal text: once in the
 * migration file (which is hand-checked SQL and cannot `import` a TS
 * constant) and once more in `meta/0010_snapshot.json`'s own record of the
 * generated column's `as` expression. Nothing but a test that reads all
 * three and compares them keeps a future edit to `schema.ts` from silently
 * leaving either copy behind — `pnpm db:generate` would only catch a schema
 * drift in the *generated* statements, never in the hand-added `DO` blocks'
 * own repeated use of the same charset text, and never in a comment that
 * quietly goes stale.
 */

import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { FOLD_SQL, JS_TRIM_CHARSET_SQL } from "../schema.ts";

const MIGRATION_URL = new URL("../../drizzle/0010_counterparty_name_folded.sql", import.meta.url);
const SNAPSHOT_URL = new URL("../../drizzle/meta/0010_snapshot.json", import.meta.url);

function migrationText(): string {
  return readFileSync(MIGRATION_URL, "utf8");
}

type ColumnsBag = Record<string, { generated?: { as?: string } } | undefined>;

function counterpartiesGeneratedAs(): string | undefined {
  const snapshot = JSON.parse(readFileSync(SNAPSHOT_URL, "utf8")) as {
    tables: Record<string, { columns: ColumnsBag }>;
  };
  const table = snapshot.tables["public.counterparties"];
  const column = table?.columns["name_folded"];
  return column?.generated?.as;
}

describe("the migration text stays byte-identical to schema.ts (R4 L1)", () => {
  it("contains FOLD_SQL verbatim", () => {
    expect(migrationText()).toContain(FOLD_SQL);
  });

  it("contains JS_TRIM_CHARSET_SQL verbatim", () => {
    expect(migrationText()).toContain(JS_TRIM_CHARSET_SQL);
  });

  it("the snapshot's generated `as` expression equals FOLD_SQL exactly", () => {
    expect(counterpartiesGeneratedAs()).toBe(FOLD_SQL);
  });
});
