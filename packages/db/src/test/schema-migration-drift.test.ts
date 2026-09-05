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

import { readFileSync } from "node:fs";
import { type DrizzleSnapshotJSON, generateDrizzleJson, generateMigration } from "drizzle-kit/api";
import { describe, expect, it } from "vitest";
import * as schema from "../schema.ts";

const JOURNAL_URL = new URL("../../drizzle/meta/_journal.json", import.meta.url);

/** The most recently generated snapshot — the one a real `generate` would diff against. */
function latestSnapshot(): DrizzleSnapshotJSON {
  const journal = JSON.parse(readFileSync(JOURNAL_URL, "utf8")) as {
    entries: readonly { idx: number }[];
  };
  const last = journal.entries.at(-1);
  if (!last) throw new Error("the migration journal has no entries");

  const snapshotUrl = new URL(
    `../../drizzle/meta/${String(last.idx).padStart(4, "0")}_snapshot.json`,
    import.meta.url,
  );
  return JSON.parse(readFileSync(snapshotUrl, "utf8")) as DrizzleSnapshotJSON;
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
