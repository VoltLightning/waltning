/**
 * The known-failures scanner, as a plain module — `known-failures.test.ts`
 * is the test, this is what it tests.
 *
 * Biome's `noExportsInTest` refuses an `export` inside a `*.test.ts` file, and
 * `inventoryOf` has to be one: the composition test in `known-failures.test.ts`
 * proves `inventoryOf` really is the flatMap over the file list it is given by
 * calling it directly against a fixture the real glob does not cover
 * (`tests/setup/known-failure-fixture.ts`) — a temp file in a directory the
 * glob excludes would prove nothing, since `inventoryOf` never globs, it only
 * reads the paths it is handed.
 */

import { readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = fileURLToPath(new URL("..", import.meta.url));
const read = (p: string): string => readFileSync(join(repoRoot, p), "utf8");

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
export const FINDING_ID_RE = /^(?:R[1-6](?!\d)(?: [CHML]\d*(?:-r\d+)?)?|suite — )/;

export interface Entry {
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
export function stripBlockComments(text: string): string {
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

export function directFindingsIn(file: string, text: string): Entry[] {
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
export function expandLoopTemplates(text: string, entries: Entry[]): Entry[] {
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

export function boundFormFindingsIn(file: string, text: string): Entry[] {
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

/**
 * The whole inventory: every finding in every given file, in order.
 *
 * **The composition itself is the property under test.** `allEntries` in
 * `known-failures.test.ts` is `inventoryOf(journeyFiles)`, and every other
 * assertion there reads `allEntries` — a `const` that would just as happily
 * be `[]`. Swap the `flatMap` below for `[]` and only the test that calls
 * `inventoryOf` directly, against a fixture outside the real glob, catches it.
 */
export function inventoryOf(files: readonly string[]): Entry[] {
  return files.flatMap(findingsIn);
}

/** The id itself: the title up to its first " — ", or the whole title if there isn't one. */
export const idOf = (title: string): string => title.split(" — ")[0] ?? title;

export function inventoryTable(entries: Entry[]): string {
  return entries.map((e) => `${e.file} :: ${idOf(e.title)} :: ${e.title}`).join("\n");
}
