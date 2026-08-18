/**
 * Every operation a screen names must exist in the registry.
 *
 * `architecture/README.md` reported **"operations referenced by a screen but
 * missing from the registry: 0"** for a long time while the number was simply
 * written down. It was wrong: S33 named eight operations and `operations.md`
 * had none of them, and nothing anywhere computed the figure that said
 * otherwise.
 *
 * That is the register's one sentence in miniature — *asserting is not
 * enforcing* — and a count nobody derives is worse than no count, because it
 * reads as verification. This file derives it.
 *
 * **Both exclusion sets are derived, not maintained.** A hand-kept list of
 * "things that look like operations but aren't" would go stale exactly like the
 * number it replaced. Schema names come from `schema.ts`; the deliberate
 * non-operations come from `operations.md`'s own *What is never an operation*
 * section. Adding either is therefore a change to a real source, in the open.
 */

import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const repoRoot = fileURLToPath(new URL("..", import.meta.url));
const screensDir = join(repoRoot, "docs/specification/screens");
const read = (p: string): string => readFileSync(join(repoRoot, p), "utf8");

/**
 * `verb_noun` in backticks — `operations.md` states that naming rule, and it is
 * what makes an operation distinguishable from prose at all. The trailing `(`
 * is not required: screens write both `run_backup` and `get_audit_log(entity,
 * id)`.
 */
const SNAKE = /`([a-z][a-z0-9]*(?:_[a-z0-9]+)+)/g;

const namesIn = (text: string): Set<string> =>
  new Set([...text.matchAll(SNAKE)].map((m) => m[1] ?? "").filter(Boolean));

const operationsDoc = read("docs/specification/operations.md");

/**
 * The registry proper stops where the exclusions begin. Without this split the
 * three names below would count as registered *because they are named in the
 * section that says they are not*, and the check would pass by reading its own
 * counterexample as evidence.
 */
const NEVER_HEADING = "## What is never an operation";
const cut = operationsDoc.indexOf(NEVER_HEADING);
const registered = namesIn(operationsDoc.slice(0, cut));
const neverOperations = namesIn(
  operationsDoc.slice(cut, operationsDoc.indexOf("## Auto-mode, restated as a rule")),
);

/**
 * Tables and columns. A screen's §5 names the data as well as the operations,
 * and every non-operation the scan currently meets — `agent_tool_calls`,
 * `counterparty_role`, `ksef_id` — is an identifier in this one file.
 *
 * Deliberately every identifier, not only `pgTable` names: half of them are
 * columns. Checked **after** the registry, so a name that is both stays an
 * operation.
 */
const schemaIdentifiers = new Set(
  [...read("packages/db/src/schema.ts").matchAll(/\b([a-z][a-z0-9]*(?:_[a-z0-9]+)+)\b/g)]
    .map((m) => m[1] ?? "")
    .filter(Boolean),
);

const screenFiles = readdirSync(screensDir).filter((f) => /^S\d+.*\.md$/.test(f));

/** Every screen's §5, or the reason there isn't one. */
function dataSectionOf(file: string): string {
  const text = readFileSync(join(screensDir, file), "utf8");
  const section = /^## 5\. Data$([\s\S]*?)^## 6\./m.exec(text)?.[1];
  if (section === undefined) {
    throw new Error(
      `${file} has no "## 5. Data" section — this scan would skip it silently. ` +
        "The screen template requires one; fix the screen, do not widen the regex.",
    );
  }
  return section;
}

/** Table rows only. The prose under a §5 discusses columns, states and history. */
function candidatesIn(section: string): Set<string> {
  const rows = section
    .split("\n")
    .map((l) => l.trim())
    .filter((l) => l.startsWith("|") && !/^\|[\s|:-]*\|$/.test(l));
  return namesIn(rows.join("\n"));
}

describe("every operation a screen names is in the registry", () => {
  it("leaves nothing unaccounted for", () => {
    const unaccounted: string[] = [];

    for (const file of screenFiles) {
      for (const name of candidatesIn(dataSectionOf(file))) {
        if (registered.has(name)) continue;
        if (neverOperations.has(name)) continue;
        if (schemaIdentifiers.has(name)) continue;
        unaccounted.push(`${file}: ${name}`);
      }
    }

    expect(
      unaccounted,
      "named by a screen, and neither a registered operation, a deliberate " +
        "non-operation, nor a name in schema.ts — classify it in one of those three",
    ).toEqual([]);
  });

  /**
   * Guards the guard. Every assertion above is `expect([]).toEqual([])` the
   * moment a regex stops matching, and that failure is invisible — it looks
   * exactly like success. Two tests in this repo have already passed over
   * nothing for a whole PR.
   */
  it("is scanning something", () => {
    expect(screenFiles.length, "screen documents found").toBeGreaterThan(25);
    expect(registered.size, "operations parsed from the registry").toBeGreaterThan(50);

    const candidates = new Set<string>();
    for (const file of screenFiles) {
      for (const n of candidatesIn(dataSectionOf(file))) candidates.add(n);
    }
    expect(candidates.size, "names parsed from screen §5 tables").toBeGreaterThan(100);
  });

  it("does not count the exclusions as registered", () => {
    // The split at `What is never an operation` is the whole reason this check
    // cannot pass by reading its own counterexample. If the heading is renamed,
    // `cut` becomes -1, the registry becomes empty, and this says so.
    expect(cut, "the exclusions heading must exist").toBeGreaterThan(0);
    for (const name of ["retry_entry", "edit_entry", "discard_entry"]) {
      expect(neverOperations.has(name), `${name} is a documented non-operation`).toBe(true);
      expect(registered.has(name), `${name} must not read as registered`).toBe(false);
    }
  });

  /**
   * S33 is the case that exposed all of this. Named eight operations, had none
   * of them, and the README said zero were missing.
   */
  it("has S33's operations, which were the ones that were missing", () => {
    for (const name of [
      "get_assists",
      "get_provider_status",
      "list_models",
      "set_assist_model",
      "set_assist_enabled",
      "set_all_assists_enabled",
      "test_provider",
      "run_fixture_score",
    ]) {
      expect(registered.has(name), `${name} must be in operations.md`).toBe(true);
    }
  });
});
