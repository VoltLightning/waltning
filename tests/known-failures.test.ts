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
 * This file's job is to guard the *scanner*, not to demand that failures
 * exist. The live inventory is allowed to be empty — a branch where every
 * encoded finding has been fixed is the goal, not a bug in this test — so
 * what's asserted directly is that each shape the scanner has to recognise
 * (a direct `it.fails(` call, the bound `finding ? it.fails : it` form, a
 * loop-expanded template-literal title, and a mention inside a comment that
 * must be ignored) is fed through the same regexes this file uses on real
 * source and comes out found and classified exactly. A scan-sanity check
 * guards the other way a count of zero could lie: that the glob actually
 * matched at least one journey/invariant file, so a moved or renamed
 * directory can't make the whole scan vacuous while still reporting zero.
 * Only once those hold does the file assert every *live* `it.fails(` title
 * starts with a finding id — printing the full inventory on failure, and
 * saying plainly when there's nothing to print.
 *
 * The checked set is the same glob `docs-consistency.test.ts` uses for
 * `describe("journeys and invariants")` — derived from the filesystem, so a
 * file a parallel task adds is covered the moment it lands.
 *
 * The scanner itself — `inventoryOf` and everything it is built from — lives
 * in `known-failures-inventory.ts`, a plain module rather than part of this
 * file: Biome's `noExportsInTest` refuses an `export` inside a `*.test.ts`
 * file, and `inventoryOf` has to be exported for the composition test below
 * to call it directly.
 */

import { globSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import {
  boundFormFindingsIn,
  directFindingsIn,
  expandLoopTemplates,
  FINDING_ID_RE,
  idOf,
  inventoryOf,
  inventoryTable,
  stripBlockComments,
} from "./known-failures-inventory.ts";

const repoRoot = fileURLToPath(new URL("..", import.meta.url));

const journeyFiles = [
  ...globSync("packages/*/src/{journeys,invariants}/**/*.test.{ts,tsx}", { cwd: repoRoot }),
  ...globSync("apps/*/src/journeys/**/*.test.tsx", { cwd: repoRoot }),
].sort();

const allEntries = inventoryOf(journeyFiles);

describe("known failures", () => {
  /**
   * `allEntries` is `inventoryOf(journeyFiles)` — proven here against a file
   * the real glob never reaches, `tests/setup/known-failure-fixture.ts`,
   * rather than a temp file the glob's own exclusion would make the proof
   * vacuous either way. Replace the `flatMap` inside `inventoryOf` with `[]`
   * and this is the test that catches it: every other assertion in this file
   * reads `allEntries`, which would just as happily be `[]`.
   */
  it("composes the flatMap over the files it is given", () => {
    const fixture = "tests/setup/known-failure-fixture.ts";
    const entries = inventoryOf([fixture]);
    expect(entries.map((e) => e.title)).toEqual([
      "R1 C1 — a fixture finding, read by inventoryOf but never executed",
    ]);
    expect(entries.every((e) => e.file === fixture)).toBe(true);

    // And the composition, not just one file's output: two files in, both
    // files' findings out — an implementation that dropped the flatMap for a
    // single lookup would pass the single-file case above and fail this one.
    expect(inventoryOf([fixture, fixture])).toHaveLength(2);
    expect(inventoryOf([])).toEqual([]);
  });

  /**
   * Guards the other way a live count of zero could lie: a moved or renamed
   * journeys/invariants directory would make the glob below match nothing,
   * and a scan over an empty file list reports zero findings whether or not
   * any exist. This is independent of whether the branch currently carries
   * any `it.fails(` calls at all.
   */
  it("scans at least one journey or invariant file", () => {
    expect(
      journeyFiles.length,
      "journey/invariant files matched by the glob this scan runs over",
    ).toBeGreaterThan(0);
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

  /**
   * Guards the scan itself, one shape at a time: a plain direct call, a
   * loop-expanded template-literal title, a title bound through a
   * `finding ? it.fails : it` name, and a doc-comment mention of
   * `it.fails("…")` that never actually calls it and must be ignored. Each
   * sample is fed through the exact same regexes and functions the live scan
   * uses, so these fixtures prove the scanner works whether or not the live
   * inventory below finds anything.
   */
  it("finds and classifies a direct call, a template-literal title, a bound-form title, and ignores a comment mention", () => {
    const directSample = stripBlockComments('it.fails("R2 H3 — a real finding", () => {});\n');
    expect(directFindingsIn("sample", directSample).map((e) => e.title)).toEqual([
      "R2 H3 — a real finding",
    ]);

    const templateSample = stripBlockComments(
      // biome-ignore lint/suspicious/noTemplateCurlyInString: a plain string standing in for a source file's own text — `${seed}` here is literal characters this sample is scanned for, never interpolated.
      "for (const seed of SEEDS) {\n  it.fails(`R1 H1-r4 — seed ${seed}: a template title`, () => {});\n}\nconst SEEDS = [1, 2, 3] as const;\n",
    );
    const templateEntries = expandLoopTemplates(
      templateSample,
      directFindingsIn("sample", templateSample),
    );
    expect(templateEntries.map((e) => e.title)).toEqual([
      "R1 H1-r4 — seed 1: a template title",
      "R1 H1-r4 — seed 2: a template title",
      "R1 H1-r4 — seed 3: a template title",
    ]);

    const boundSample = stripBlockComments(
      'const FINDING: Partial<Record<number, string>> = {\n  0: "R2 C1", // a comment\n  2: "R2 H1-r3",\n};\nconst test = finding ? it.fails : it;\n',
    );
    const boundEntries = boundFormFindingsIn("sample", boundSample);
    expect(boundEntries.map((e) => idOf(e.title)).sort()).toEqual(["R2 C1", "R2 H1-r3"]);

    const commentSample = stripBlockComments(
      '/**\n * mentions `it.fails("R4 H-r4")` in prose, never calling it\n */\n',
    );
    expect(directFindingsIn("sample", commentSample)).toEqual([]);
  });

  it("gives every live it.fails( a title that starts with a finding id, or reports there are none", () => {
    const offenders = allEntries.filter((e) => !FINDING_ID_RE.test(e.title));
    const message =
      offenders.length > 0
        ? `it.fails( titles with no leading finding id — the list a fix PR consults:\n${inventoryTable(
            offenders,
          )}\n\nfull inventory:\n${inventoryTable(allEntries)}`
        : allEntries.length === 0
          ? "no known failures — every encoded finding is fixed"
          : "every it.fails( title starts with a finding id";
    expect(offenders, message).toEqual([]);
  });
});
