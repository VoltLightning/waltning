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

/**
 * Doc comments illustrate `it.fails(...)` in prose without ever calling it —
 * `j16-move-money.journey.test.tsx`'s own header does exactly this
 * (`` `it.fails("R4 H-r4")` ``, inside a `/** … *\/` block), and a scan that
 * doesn't know the difference counts a site that doesn't exist. Block
 * comments are blanked (character-for-character, so line numbers used
 * nowhere here still line up if anyone adds offset reporting later) before
 * either scan below runs.
 */
function stripBlockComments(text: string): string {
  return text.replace(/\/\*[\s\S]*?\*\//g, (m) => m.replace(/[^\n]/g, " "));
}

/**
 * Direct calls: `it.fails("…")`, `it.fails('…')` or `` it.fails(`…`) ``. The
 * title is the whole first argument, up to the matching (same-style) quote
 * — titles in this codebase do not embed an escaped or opposite-style
 * quote, so a non-greedy match to the next matching quote is exact for all
 * three styles, backtick included (`read-equals-write.test.ts`'s own
 * per-seed titles are template literals, not plain strings).
 */
const IT_FAILS_RE = /\bit\.fails\(\s*(["'`])(.*?)\1/gs;

function directFindingsIn(file: string, text: string): Entry[] {
  return [...text.matchAll(IT_FAILS_RE)].map((m) => ({ file, title: m[2] ?? "" }));
}

/**
 * Loop-parameterised titles: `for (const X of ARR) { it.fails(\`…${X}…\`, …) }`
 * with `ARR` a same-file `const ARR = [a, b, …]` array of literals — this
 * scan's only shape of it is `read-equals-write.test.ts`'s `SEEDS` loop, one
 * source line registering five real, distinct `it.fails` calls (one per
 * seed) the moment vitest collects the file. Substituting each element back
 * into the matched template turns that one source-level match into the five
 * inventory entries it actually stands for. A title whose loop or array this
 * can't resolve is kept once, unexpanded — its finding id is always literal
 * text ahead of the interpolation, so the id check below still holds either
 * way; only the *count* would undershoot.
 */
function expandLoopTemplates(text: string, entries: Entry[]): Entry[] {
  return entries.flatMap((entry) => {
    const interp = /\$\{(\w+)\}/.exec(entry.title);
    if (!interp) return [entry];
    const varName = interp[1] as string;
    const forMatch = new RegExp(`for\\s*\\(\\s*const\\s+${varName}\\s+of\\s+(\\w+)\\s*\\)`).exec(
      text,
    );
    if (!forMatch) return [entry];
    const arrName = forMatch[1] as string;
    const arrMatch = new RegExp(`const\\s+${arrName}\\s*=\\s*\\[([^\\]]*)\\]`).exec(text);
    if (!arrMatch) return [entry];
    const elements = (arrMatch[1] ?? "")
      .split(",")
      .map((s) => s.trim())
      .filter((s) => s.length > 0);
    if (elements.length === 0) return [entry];
    return elements.map((el) => ({
      ...entry,
      title: entry.title.replaceAll(`\${${varName}}`, el),
    }));
  });
}

/**
 * Bound form: `const NAME = <cond> ? it.fails : it;`, called later as
 * `NAME(label, …)` with `label` built at runtime — no `it.fails(` text
 * exists at the call site at all. Both `name-collision-parity.test.ts`
 * files (ledger and db) are the only shape of this on the branch: a
 * `Partial<Record<number, string>>` map from a corpus index to a finding id,
 * read by the same ternary that binds `NAME`. Rather than interpreting the
 * `.forEach` to recover exactly which titles it builds, this reads the same
 * map the code reads — each entry is one bound `it.fails` site, matching
 * `LEDGER_FINDING`'s three and `POSTGRES_FINDING`'s five.
 */
const BOUND_FORM_RE = /\bconst\s+\w+\s*=\s*\w+\s*\?\s*it\.fails\s*:\s*it\b/;
const FINDING_MAP_RE =
  /const\s+\w*FINDING\w*\s*:\s*Partial<Record<number,\s*string>>\s*=\s*\{([\s\S]*?)\n\};/;
const FINDING_ENTRY_RE = /(\d+):\s*"([^"]+)"/g;

function boundFormFindingsIn(file: string, text: string): Entry[] {
  if (!BOUND_FORM_RE.test(text)) return [];
  const mapMatch = FINDING_MAP_RE.exec(text);
  if (!mapMatch) return [];
  const body = mapMatch[1] ?? "";
  return [...body.matchAll(FINDING_ENTRY_RE)].map(([, index, findingId]) => ({
    file,
    title: `${findingId} — NAME_PAIRS[${index}], bound to it.fails via this file's own finding lookup`,
  }));
}

function findingsIn(file: string): Entry[] {
  const text = stripBlockComments(read(file));
  return [
    ...expandLoopTemplates(text, directFindingsIn(file, text)),
    ...boundFormFindingsIn(file, text),
  ];
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

  /**
   * Guards the scan itself: template-literal titles, titles bound through a
   * `finding ? it.fails : it` name, and a doc-comment mention of
   * `it.fails("…")` that never actually calls it.
   */
  it("recognises a template-literal title, a bound-form title, and ignores a comment mention", () => {
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
