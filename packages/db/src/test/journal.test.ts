/**
 * The journal and the migration files must agree.
 *
 * `drizzle-kit migrate` applies what the **journal** lists, not what is on
 * disk. So a `.sql` file added without a journal entry is not a failure — it is
 * a silent skip, in the layer that carries every guarantee this system claims.
 * The migration would simply never run, and the database would look correct.
 *
 * The journal is maintained by hand here (`architecture/05`), which is exactly
 * the condition under which an entry gets forgotten.
 */

import { readdirSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { migrationsFolder } from "./scratch.ts";

type Journal = { entries: { idx: number; tag: string }[] };

const journal: Journal = JSON.parse(
  readFileSync(fileURLToPath(new URL("../../drizzle/meta/_journal.json", import.meta.url)), "utf8"),
);

const files = readdirSync(migrationsFolder)
  .filter((f) => f.endsWith(".sql"))
  .map((f) => f.replace(/\.sql$/, ""))
  .sort();

const tags = journal.entries.map((e) => e.tag);

describe("migration journal", () => {
  it("lists every .sql file on disk — an unlisted file is silently never applied", () => {
    expect(
      files.filter((f) => !tags.includes(f)),
      "on disk, missing from journal",
    ).toEqual([]);
  });

  it("references no file that does not exist", () => {
    expect(
      tags.filter((t) => !files.includes(t)),
      "in journal, missing on disk",
    ).toEqual([]);
  });

  it("is ordered, with contiguous indexes", () => {
    expect(journal.entries.map((e) => e.idx)).toEqual(journal.entries.map((_, i) => i));
    expect(tags).toEqual([...tags].sort());
  });
});
