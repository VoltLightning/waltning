/**
 * The completeness checks, executed.
 *
 * `completeness.md` describes these as "queries, not judgement" and says to run
 * them after any structural change. Nothing ran them. That is the same shape as
 * every other control this repository has had to fix: a documented check that
 * depends on someone remembering, and on them writing the query correctly in
 * the moment.
 *
 * Both halves of that fail in practice. Running the screen-reachability check
 * by hand produced three false orphans within a minute, because flows reference
 * sub-steps — `S02a`, `S29b` — and `\bS02\b` does not match `S02a`. The
 * normalisation below is the thing a hand-written regex keeps getting wrong,
 * which is precisely why it belongs in a file rather than in a habit.
 */

import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const specRoot = fileURLToPath(new URL("../docs/specification", import.meta.url));
const read = (p: string) => readFileSync(p, "utf8");
const list = (dir: string, re: RegExp) =>
  readdirSync(join(specRoot, dir)).filter((f) => re.test(f));

const screenFiles = list("screens", /^S\d\d.*\.md$/);
const flowFiles = list("flows", /^J\d\d.*\.md$/);

/** `S02`, and also `S02a` / `S29b` — sub-steps of the same screen. */
const SCREEN_REF = /\bS(\d\d)[a-z]?\b/g;

const screenIds = new Set(screenFiles.map((f) => f.slice(1, 3)));
const flowText = flowFiles.map((f) => read(join(specRoot, "flows", f)));

function refsIn(text: string): Set<string> {
  const out = new Set<string>();
  for (const m of text.matchAll(SCREEN_REF)) if (m[1]) out.add(m[1]);
  return out;
}

describe("screens and flows", () => {
  it("has no flow referencing a screen that does not exist", () => {
    const dangling: string[] = [];
    flowFiles.forEach((file, i) => {
      for (const id of refsIn(flowText[i] ?? "")) {
        if (!screenIds.has(id)) dangling.push(`${file} → S${id}`);
      }
    });
    expect(dangling, "flows referencing a missing screen").toEqual([]);
  });

  it("has every screen reachable from at least one journey", () => {
    const reachable = new Set<string>();
    for (const t of flowText) for (const id of refsIn(t)) reachable.add(id);
    const orphans = [...screenIds].filter((id) => !reachable.has(id)).sort();
    expect(orphans, "screens no journey reaches").toEqual([]);
  });

  /** Guards the guard: a broken regex would make both checks vacuously true. */
  it("actually resolves references, including lettered sub-steps", () => {
    expect(refsIn("goes to S02a then S29b")).toEqual(new Set(["02", "29"]));
    expect(screenIds.size).toBeGreaterThan(25);
  });
});

describe("screen documents", () => {
  const REQUIRED = [
    "## 1. Purpose",
    "## 2. Entry and exit",
    "## 3. Layout",
    "## 4. Components",
    "## 5. Data",
    "## 6. States",
    "## 7. Interaction",
    "## 8. Rules this screen must obey",
    "## 9. Open questions",
  ];

  it("all carry the nine template sections", () => {
    const incomplete: string[] = [];
    for (const file of screenFiles) {
      const text = read(join(specRoot, "screens", file));
      const missing = REQUIRED.filter((h) => !text.includes(h));
      if (missing.length) incomplete.push(`${file}: ${missing.join(", ")}`);
    }
    expect(incomplete, "screens missing template sections").toEqual([]);
  });

  it("leaves no unresolved markers outside the templates", () => {
    const offenders: string[] = [];
    for (const dir of ["screens", "flows"]) {
      for (const file of list(dir, /\.md$/)) {
        if (file.startsWith("_TEMPLATE")) continue;
        const text = read(join(specRoot, dir, file));
        if (/\bTODO\b|\bTBD\b|⊗/.test(text)) offenders.push(`${dir}/${file}`);
      }
    }
    expect(offenders, "unresolved markers").toEqual([]);
  });
});
