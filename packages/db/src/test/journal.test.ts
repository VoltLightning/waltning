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

type Journal = { entries: { idx: number; tag: string; when: number }[] };

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

  it("is ordered, with no duplicate index", () => {
    const idxs = journal.entries.map((e) => e.idx);
    expect(idxs).toEqual([...idxs].sort((a, b) => a - b));
    expect(new Set(idxs).size).toBe(idxs.length);
    expect(tags).toEqual([...tags].sort());
  });

  // C1 — `drizzle-kit migrate` walks entries in `idx` order but skips any
  // whose `when` is not newer than the last one it applied. A hand-edited
  // `when` that lands before an earlier entry's is invisible to every check
  // above (idx still ordered, tag still matches) and silently skips that
  // migration on any database already past it.
  it("has strictly increasing `when` across entries", () => {
    const whens = journal.entries.map((e) => e.when);
    expect(whens).toEqual([...whens].sort((a, b) => a - b));
    expect(new Set(whens).size).toBe(whens.length);
  });

  // M2 — the bug itself: an entry's `idx` drifting from the number already
  // in its own `tag` (`idx: 8` beside `tag: "0009_…"`) is exactly what makes
  // `drizzle-kit`'s own next-prefix-from-`entries.length` collide with a tag
  // that already exists. Every entry's `idx` must match the prefix baked
  // into its own tag, always.
  it("every entry's idx matches its own tag's numeric prefix", () => {
    for (const entry of journal.entries) {
      expect(
        entry.tag.startsWith(String(entry.idx).padStart(4, "0")),
        `idx ${entry.idx} does not match tag ${entry.tag}`,
      ).toBe(true);
    }
  });
});
