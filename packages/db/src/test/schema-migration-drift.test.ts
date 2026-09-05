/**
 * `schema.ts` and the committed migrations must never drift — R4 M1.
 *
 * A hand-edited `meta/NNNN_snapshot.json` used to be possible without
 * anything noticing: `0010`'s snapshot was missing the
 * `counterparties_name_trimmed` CHECK it had itself been generated from, so
 * the *next* `drizzle-kit generate` would have diffed against a snapshot
 * that disagreed with the database it actually described and emitted a
 * duplicate `ADD CONSTRAINT`. `pnpm db:generate`, run by a person, was the
 * only thing that could catch it — and it never runs on its own.
 *
 * This runs the same diff `drizzle-kit generate` runs, in-process, against
 * the latest committed snapshot, and asserts it proposes nothing. Passing
 * `imports` this way is exactly the API's contract (`api.d.ts`): CLI
 * `generate` uses `generateDrizzleJson`/`generateMigration` themselves, so
 * this is not a re-implementation to keep in sync with a real one — it *is*
 * the real one, called directly instead of shelling out.
 */

import { readdirSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { type DrizzleSnapshotJSON, generateDrizzleJson, generateMigration } from "drizzle-kit/api";
import { describe, expect, it } from "vitest";
import * as schema from "../schema.ts";

const META_DIR = fileURLToPath(new URL("../../drizzle/meta", import.meta.url));

/**
 * The most recently *generated* snapshot — the one a real `generate` would
 * diff against.
 *
 * **Not necessarily the last journal entry's own.** A hand-written migration
 * (`0001_database_objects.sql`, and now `0011_transaction_scale_and_category_kind.sql`
 * — trigger-only, no `schema.ts` change) never gets a snapshot of its own, so
 * the journal's last entry can land on one of those. Scanning `meta/` for the
 * highest `NNNN_snapshot.json` on disk is what `invariants/migration-drift.test.ts`
 * already does for the identical reason, and is the one answer that survives
 * a hand-written migration landing last.
 */
function latestSnapshot(): DrizzleSnapshotJSON {
  const files = readdirSync(META_DIR)
    .filter((f) => /^\d+_snapshot\.json$/.test(f))
    .sort();
  const name = files.at(-1);
  if (!name) throw new Error(`no snapshot found in ${META_DIR}`);
  return JSON.parse(readFileSync(`${META_DIR}/${name}`, "utf8")) as DrizzleSnapshotJSON;
}

describe("schema.ts matches the committed migrations exactly (R4 M1)", () => {
  it("proposes no statements against the latest snapshot", async () => {
    // No `prevId`/`schemaFilters` — matching `drizzle.config.ts`'s own bare
    // `schema: "./src/schema.ts"`.
    const current = generateDrizzleJson(schema);
    const statements = await generateMigration(latestSnapshot(), current);

    expect(
      statements,
      "a schema change with no matching migration, or a migration whose committed " +
        "snapshot has drifted from what generated it — run `pnpm db:generate`",
    ).toEqual([]);
  });
});
