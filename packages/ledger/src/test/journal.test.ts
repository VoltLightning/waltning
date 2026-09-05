/**
 * The replica's and outbox's own `_journal.json`, checked the same way
 * `packages/db/src/test/journal.test.ts` checks the API's — this module has
 * two hand-maintained journals of its own (`drizzle/replica/meta`,
 * `drizzle/outbox/meta`), and nothing elsewhere in this package reads either
 * one back to prove it agrees with the `.sql` files beside it.
 *
 * The strictly-increasing `when` check is the one a hand edit breaks
 * silently: `drizzle-kit migrate` walks entries in `idx` order but skips any
 * whose `when` is not newer than the last one it applied, so a `when` that
 * lands before an earlier entry's is invisible to every other check here
 * (`idx` still ordered, `tag` still matches) and silently skips that
 * migration on any database already past it — `packages/db`'s own C1.
 */

import { readdirSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

type Journal = { entries: { idx: number; tag: string; when: number }[] };

const stores = [
  { name: "replica", dir: "../../drizzle/replica" },
  { name: "outbox", dir: "../../drizzle/outbox" },
] as const;

describe.each(stores)("$name migration journal", ({ dir }) => {
  const journal: Journal = JSON.parse(
    readFileSync(fileURLToPath(new URL(`${dir}/meta/_journal.json`, import.meta.url)), "utf8"),
  );

  const files = readdirSync(fileURLToPath(new URL(dir, import.meta.url)))
    .filter((f) => f.endsWith(".sql"))
    .map((f) => f.replace(/\.sql$/, ""))
    .sort();

  const tags = journal.entries.map((e) => e.tag);

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

  // C1 — see this file's header.
  it("has strictly increasing `when` across entries", () => {
    const whens = journal.entries.map((e) => e.when);
    expect(whens).toEqual([...whens].sort((a, b) => a - b));
    expect(new Set(whens).size).toBe(whens.length);
  });

  it("every entry's idx matches its own tag's numeric prefix", () => {
    for (const entry of journal.entries) {
      expect(
        entry.tag.startsWith(String(entry.idx).padStart(4, "0")),
        `idx ${entry.idx} does not match tag ${entry.tag}`,
      ).toBe(true);
    }
  });
});
