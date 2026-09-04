/**
 * Proves: `packages/db/drizzle` is the schema — CLAUDE.md's "Migrations are
 * two files... Drizzle can't state" only holds if the generated snapshot
 * drizzle-kit would emit for `schema.ts` *today* is the one already checked
 * in. If it is not, `pnpm db:generate` was owed and never run, and every
 * scratch database this suite migrates against is testing a schema nobody
 * declared.
 *
 * `drizzle-kit/api`'s `generateDrizzleJson` builds the snapshot `schema.ts`
 * would produce right now; `generateMigration` diffs it against the highest
 * `meta/*_snapshot.json` already on disk — the same diff `drizzle-kit
 * generate` runs before deciding whether to write a new migration file. An
 * empty statement list is the claim; a non-empty one is drift.
 *
 * Findings: R2 M1-r4 names this as an open risk rather than a measured one —
 * this file measures it. See
 * `packages/ledger/src/invariants/migration-drift.test.ts` for the same
 * claim against the phone's two SQLite schemas.
 */
import { readdirSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { type DrizzleSnapshotJSON, generateDrizzleJson, generateMigration } from "drizzle-kit/api";
import { describe, expect, it } from "vitest";
import * as schema from "../schema.ts";

const metaDir = fileURLToPath(new URL("../../drizzle/meta", import.meta.url));

/** The most recently generated snapshot — the one `schema.ts` should still produce. */
function highestSnapshot(): DrizzleSnapshotJSON {
  const files = readdirSync(metaDir)
    .filter((f) => /^\d+_snapshot\.json$/.test(f))
    .sort();
  const name = files[files.length - 1];
  if (!name) throw new Error(`no snapshot found in ${metaDir}`);
  return JSON.parse(readFileSync(`${metaDir}/${name}`, "utf8")) as DrizzleSnapshotJSON;
}

describe("packages/db/drizzle does not drift from schema.ts", () => {
  it("generates no statements against the highest snapshot", async () => {
    const prev = highestSnapshot();
    const current = await generateDrizzleJson(schema, prev.id);
    const statements = await generateMigration(prev, current);
    expect(statements).toEqual([]);
  });
});
