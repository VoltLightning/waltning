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

import { existsSync, globSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const repoRoot = fileURLToPath(new URL("..", import.meta.url));
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

/**
 * Every journey and invariant file cites the spec claim it is checking.
 *
 * A `.journey.test.ts` or `.invariants` file that fails silently proves
 * nothing — the whole point of `it.fails("R2 H3 — …")` is that a reader can
 * trace the finding back to a real sentence in the spec, not take the test's
 * word for it. `Proves:` is that trace; `Findings:` is the id the fix PR
 * greps for. Both are free text a human can get wrong in either direction —
 * a stale citation (the spec moved), or an invented one (the section was
 * never there) — and only a file that resolves against the actual spec tree
 * catches either.
 *
 * The glob is the checked set — `tests/registry-coverage.test.ts` derives
 * its set the same way — so a file a parallel task adds under
 * `packages/*\/src/invariants/` or `apps/*\/src/journeys/` is covered the
 * moment it lands, with nothing here to update.
 */
describe("journeys and invariants", () => {
  const journeyFiles = [
    ...globSync("packages/*/src/{journeys,invariants}/**/*.test.{ts,tsx}", { cwd: repoRoot }),
    ...globSync("apps/*/src/journeys/**/*.test.tsx", { cwd: repoRoot }),
  ].sort();

  const FIRST_BLOCK_COMMENT = /\/\*\*[\s\S]*?\*\//;

  const firstBlockCommentOf = (file: string): string =>
    FIRST_BLOCK_COMMENT.exec(read(join(repoRoot, file)))?.[0] ?? "";

  /**
   * A heading's own number or id, stripped of the trailing punctuation the
   * templates put after it — `## 9. Open questions` is cited as `§9`, not
   * `§9.`; `## 6.5 Integrity constraints` and `## 4a · FX margin…` already
   * have nothing to strip; `## H15 · A blocked outbox…` cites as bare `H15`.
   */
  const headingTokenCache = new Map<string, Set<string>>();
  function headingTokensOf(absPath: string): Set<string> {
    const cached = headingTokenCache.get(absPath);
    if (cached) return cached;
    const tokens = new Set<string>();
    for (const line of read(absPath).split("\n")) {
      const token = /^#{1,6}\s+(\S+)/.exec(line)?.[1];
      if (token) tokens.add(token.replace(/[.:]+$/, ""));
    }
    headingTokenCache.set(absPath, tokens);
    return tokens;
  }

  /** `architecture/14` → the file whose name starts with `14-`, not `14` itself. */
  function fileStartingWith(dir: string, prefix: string): string | undefined {
    return readdirSync(dir).find((f) => f.startsWith(`${prefix}-`) || f === `${prefix}.md`);
  }

  /**
   * A citation is `flows/`, `screens/` or `architecture/` plus either a full
   * filename or a bare number, optionally followed by a section marker —
   * `§14.6`, `§9`, `§4a`, or a bare `H15`. `SPEC.md` and `computations.md`
   * take the same optional marker with no directory prefix.
   *
   * The gap before the marker is `\s*\*?\s*`, not `\s+`: a `Proves:` line
   * wraps inside a `/** … *\/` comment, so `SPEC.md` and its `§7.0` can sit
   * on different lines with only a continuation `*` between them
   * (`pivot-change.journey.test.ts`'s actual header). At most one literal
   * `*` is allowed in that gap, so this still cannot bridge two unrelated
   * words of prose — only a JSDoc line-wrap boundary is all-whitespace(-and-
   * one-star) enough to match.
   *
   * The marker itself ends `\w`, not `[\w.]`: a citation sitting at the end
   * of a sentence — `§7.2.`, `§4a,` — must not swallow the punctuation into
   * the token, or it stops matching the heading's own (already-stripped)
   * token. `§14.6` mid-sentence is unaffected; only a trailing non-word
   * character right after the marker is ever dropped.
   */
  const CITATION_RE =
    /(?:\b(architecture|screens|flows)\/([A-Za-z0-9][\w.-]*)|\b(SPEC\.md)\b|\b(computations\.md)\b)(?:\s*\*?\s*(§[\w.]*\w|H\d+))?/g;

  /**
   * Every citation the block comment attempts, resolved or not. Only one
   * needs to resolve — the rest of `Proves:` is often prose about a citation
   * the *brief* got wrong, quoted to explain the correction, and that quoted
   * text can itself look like a citation without being one.
   *
   * `SPEC.md` and `computations.md` resolve **only** through a heading — a
   * bare mention of either filename, with no section marker, proves
   * nothing (both files exist regardless of what the comment says next to
   * them). `flows/`, `screens/` and `architecture/` citations keep the
   * file-existence fallback: those name one specific document each, so
   * citing the file without a section is still a real, checkable claim.
   */
  function resolveCitations(text: string): { resolved: string[]; attempted: string[] } {
    const resolved: string[] = [];
    const attempted: string[] = [];
    for (const [whole, prefix, pathToken, specMd, compMd, marker] of text.matchAll(CITATION_RE)) {
      let filePath: string;
      const requiresHeading = Boolean(specMd || compMd);
      if (prefix && pathToken) {
        const dir = join(specRoot, prefix);
        const file = pathToken.endsWith(".md") ? pathToken : fileStartingWith(dir, pathToken);
        filePath = join(dir, file ?? pathToken);
      } else if (specMd) {
        filePath = join(repoRoot, "SPEC.md");
      } else if (compMd) {
        filePath = join(specRoot, "computations.md");
      } else {
        continue;
      }
      const fileExists = existsSync(filePath);
      const token = marker?.startsWith("§") ? marker.slice(1) : marker;
      const headingHasToken =
        Boolean(token) && fileExists && headingTokensOf(filePath).has(token ?? "");
      const ok = token ? headingHasToken : !requiresHeading && fileExists;
      attempted.push(
        `${(whole ?? "").trim()} → file ${fileExists ? "exists" : "missing"}` +
          (token
            ? `, heading "${token}" ${headingHasToken ? "found" : "missing"}`
            : requiresHeading
              ? " (no section marker — SPEC.md/computations.md require one)"
              : ""),
      );
      if (ok) resolved.push((whole ?? "").trim());
    }
    return { resolved, attempted };
  }

  it("is scanning something", () => {
    expect(journeyFiles.length, "journey and invariant files found").toBeGreaterThan(5);
  });

  /**
   * Guards the guard: a parser that resolves everything, or nothing, would
   * make the assertion below pass or fail for the wrong reason.
   */
  it("actually resolves citations, and actually rejects a bogus one", () => {
    expect(resolveCitations("architecture/14 §14.6").resolved).toEqual(["architecture/14 §14.6"]);
    expect(resolveCitations("SPEC.md §6.5 table").resolved).toEqual(["SPEC.md §6.5"]);
    expect(resolveCitations("architecture/99-nowhere.md §1").resolved).toEqual([]);
    expect(resolveCitations("docs/nonexistent.md §99").resolved).toEqual([]);

    // A bare mention of SPEC.md/computations.md, with no section marker, is
    // not a citation — both files exist regardless of what the prose says.
    expect(
      resolveCitations("nothing in particular, but SPEC.md is a file, and computations.md is too.")
        .resolved,
    ).toEqual([]);
    // flows/screens/architecture keep the file-existence fallback: naming
    // one specific document, with no section, is still a real claim.
    expect(resolveCitations("flows/J02-daily-capture.md, unspecified section").resolved).toEqual([
      "flows/J02-daily-capture.md",
    ]);

    // A JSDoc line-wrap between the filename and its marker must still
    // resolve through the heading, not fall back to file-existence-only.
    expect(resolveCitations("SPEC.md\n * §7.0 table").resolved).toEqual(["SPEC.md\n * §7.0"]);
    expect(resolveCitations("computations.md\n * §4a margin").resolved).toEqual([
      "computations.md\n * §4a",
    ]);
    // The wrap tolerance is one continuation `*`, not arbitrary prose — a
    // real paragraph break must not bridge two unrelated citations.
    expect(
      resolveCitations("SPEC.md is mentioned here.\n\nElsewhere, §7.0 is unrelated.").resolved,
    ).toEqual([]);

    // A citation at the end of a sentence must not swallow the punctuation
    // into the token: `§7.2.` resolves as `7.2`, `§4a,` as `4a`.
    expect(resolveCitations("SPEC.md §7.2. Findings: nothing here.").resolved).toEqual([
      "SPEC.md §7.2",
    ]);
    expect(resolveCitations("computations.md §4a, margin").resolved).toEqual([
      "computations.md §4a",
    ]);
  });

  it("every file's first block comment cites a real spec section and states its findings", () => {
    const problems: string[] = [];
    for (const file of journeyFiles) {
      const comment = firstBlockCommentOf(file);
      const provesIdx = comment.indexOf("Proves:");
      const findingsIdx = comment.indexOf("Findings:", provesIdx + 1);
      if (provesIdx < 0 || findingsIdx < 0) {
        const missing = [provesIdx < 0 && "Proves:", findingsIdx < 0 && "Findings:"]
          .filter(Boolean)
          .join(" and ");
        problems.push(`${file}: first block comment has no ${missing}`);
        continue;
      }
      const provesText = comment.slice(provesIdx + "Proves:".length, findingsIdx);
      const { resolved, attempted } = resolveCitations(provesText);
      if (resolved.length === 0) {
        problems.push(
          `${file}: no citation resolved against docs/specification or SPEC.md — tried: ${
            attempted.join("; ") || "(nothing that looked like a citation)"
          }`,
        );
      }
    }
    expect(problems, "journey/invariant files with no resolvable spec citation").toEqual([]);
  });
});
