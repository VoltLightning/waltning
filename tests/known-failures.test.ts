/**
 * The known-failures inventory, derived.
 *
 * A journey or invariant file marks a live defect with `it.fails("<finding
 * id> — …")` rather than a plain `it`, so that the test itself proves the
 * gap is real — an `it` that quietly passed would be lying either way. That
 * only works as a *list a fix PR consults* if every title actually carries
 * an id: `it.fails("this one's flaky")` reads exactly like a finding until
 * someone opens the file, at which point it is a lie of a different shape
 * than the one `it.fails` exists to catch.
 *
 * This file does two things: asserts every `it.fails(` title on the branch
 * starts with a finding id, and — on failure only — prints the full
 * inventory (file, id, title) so the assertion message itself is the list a
 * fix PR reads, rather than something a human has to go and recompute.
 *
 * The checked set is the same glob `docs-consistency.test.ts` uses for
 * `describe("journeys and invariants")` — derived from the filesystem, so a
 * file a parallel task adds is covered the moment it lands.
 */

import { globSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const repoRoot = fileURLToPath(new URL("..", import.meta.url));
const read = (p: string): string => readFileSync(join(repoRoot, p), "utf8");

const journeyFiles = [
  ...globSync("packages/*/src/{journeys,invariants}/**/*.test.{ts,tsx}", { cwd: repoRoot }),
  ...globSync("apps/*/src/journeys/**/*.test.tsx", { cwd: repoRoot }),
].sort();

/**
 * `it.fails("…")` or `it.fails('…')` — the title is the whole first
 * argument, up to the matching quote. Titles in this codebase do not embed
 * an escaped or opposite-style quote, so a non-greedy match to the next
 * matching quote is exact, not just adequate.
 */
const IT_FAILS_RE = /it\.fails\((['"])(.*?)\1/g;

/**
 * `R2 H3`, `R2 H1-r3`, `R4 H-r4` (a rule-level finding with no revision
 * digit) — the shape named in this task's brief — plus one shape the brief's
 * regex does not cover but the branch already carries: `R4` bare, with no
 * letter at all. `settle-debt.journey.test.ts`'s own header explains it —
 * `Findings: R2 H3, R4 (settle scale mirror)` — some findings are named at
 * the rule level, never broken into a lettered severity, so the id is just
 * `R[1-6]`. The `(?!\d)` after `R[1-6]` is load-bearing: without it `R23 H1`
 * would read as the bare id `R2` followed by leftover text, rather than
 * being rejected as out of range. `suite — ` covers a finding about the
 * suite itself rather than about the app.
 */
const FINDING_ID_RE = /^(?:R[1-6](?!\d)(?: [CHML]\d*(?:-r\d+)?)?|suite — )/;

interface Entry {
  file: string;
  title: string;
}

function findingsIn(file: string): Entry[] {
  const text = read(file);
  return [...text.matchAll(IT_FAILS_RE)].map((m) => ({ file, title: m[2] ?? "" }));
}

const allEntries = journeyFiles.flatMap(findingsIn);

/** The id itself: the title up to its first " — ", or the whole title if there isn't one. */
const idOf = (title: string): string => title.split(" — ")[0] ?? title;

function inventoryTable(entries: Entry[]): string {
  return entries.map((e) => `${e.file} :: ${idOf(e.title)} :: ${e.title}`).join("\n");
}

describe("known failures", () => {
  it("is scanning something", () => {
    expect(
      allEntries.length,
      "it.fails( calls found across journeys and invariants",
    ).toBeGreaterThan(5);
  });

  /**
   * Guards the guard: a regex that accepts everything, or nothing, would
   * make the assertion below pass or fail for the wrong reason.
   */
  it("actually recognises a finding id, and actually rejects a title without one", () => {
    expect(FINDING_ID_RE.test("R2 H3 — a real finding")).toBe(true);
    expect(FINDING_ID_RE.test("R2 H1-r3 — a revision of one")).toBe(true);
    expect(FINDING_ID_RE.test("R4 — a rule-level finding")).toBe(true);
    expect(FINDING_ID_RE.test("suite — a suite-level finding")).toBe(true);
    expect(FINDING_ID_RE.test("this one's flaky")).toBe(false);
    expect(FINDING_ID_RE.test("R9 H1 — out of range")).toBe(false);
    expect(FINDING_ID_RE.test("R23 H1 — two digits is not the same rule")).toBe(false);
  });

  it("gives every it.fails( a title that starts with a finding id", () => {
    const offenders = allEntries.filter((e) => !FINDING_ID_RE.test(e.title));
    expect(
      offenders,
      offenders.length === 0
        ? "every it.fails( title starts with a finding id"
        : `it.fails( titles with no leading finding id — the list a fix PR consults:\n${inventoryTable(
            offenders,
          )}\n\nfull inventory:\n${inventoryTable(allEntries)}`,
    ).toEqual([]);
  });
});
