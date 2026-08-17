/**
 * The committed agent config must work on a machine that has none of the
 * maintainer's tooling.
 *
 * `docs/agents/` is read by the installed engineering skills, and it is where a
 * personal workflow is most tempting to write down — the tracker you actually
 * use, the path to your notes. Committing that produces two failures at once:
 * it publishes a private setup to a public repository, and it hands anyone who
 * clones the repo instructions they cannot follow.
 *
 * So the split is `<name>.md` committed and `<name>.local.md` gitignored, and
 * these are the two properties that keep the split honest — an override can
 * never be committed, and a committed default can never name one machine.
 */

import { execFileSync } from "node:child_process";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const repoRoot = fileURLToPath(new URL("..", import.meta.url));
const agentsDir = join(repoRoot, "docs/agents");

/**
 * `--no-index` is load-bearing, for the same reason it is in the commit hook:
 * `git check-ignore` consults the index, so a file that was force-added is
 * *tracked* and reports back as "not ignored" — which is exactly the case this
 * is guarding against.
 */
function isIgnored(relPath: string): boolean {
  try {
    execFileSync("git", ["check-ignore", "-q", "--no-index", "--", relPath], { cwd: repoRoot });
    return true;
  } catch {
    return false;
  }
}

const present = readdirSync(agentsDir).filter((f) => f.endsWith(".md"));
const committed = present.filter((f) => !f.endsWith(".local.md"));

describe("local overrides stay local", () => {
  it("ignores the override pattern, whether or not one exists here", () => {
    // Asserted against a synthetic path so this cannot pass vacuously on a
    // fresh clone, where no override exists to check.
    expect(isIgnored("docs/agents/issue-tracker.local.md")).toBe(true);
    expect(isIgnored("docs/agents/anything-at-all.local.md")).toBe(true);
  });

  it("ignores every override actually on this machine", () => {
    const leaked = present
      .filter((f) => f.endsWith(".local.md"))
      .filter((f) => !isIgnored(`docs/agents/${f}`));
    expect(leaked, "a local override that would be committed").toEqual([]);
  });

  it("still ignores the committed defaults not at all", () => {
    // Guards the guard the other way: if the pattern were `docs/agents/*.md`,
    // the checks above would pass and the whole directory would vanish.
    const swallowed = committed.filter((f) => isIgnored(`docs/agents/${f}`));
    expect(swallowed, "committed agent docs must not be ignored").toEqual([]);
    expect(committed.length, "committed agent docs found").toBeGreaterThan(1);
  });
});

describe("committed agent docs assume nothing about the machine", () => {
  it("names no absolute path", () => {
    // An absolute path is true on exactly one machine, usually carries a
    // username, and goes stale without ever erroring.
    const ABSOLUTE = /(?:^|\s|`|\()(?:\/Users\/|\/home\/|[A-Z]:\\)/;
    const offenders: string[] = [];
    for (const file of committed) {
      const text = readFileSync(join(agentsDir, file), "utf8");
      for (const line of text.split("\n")) {
        if (ABSOLUTE.test(line)) offenders.push(`${file}: ${line.trim().slice(0, 60)}`);
      }
    }
    expect(offenders, "resolve the location instead of hardcoding it").toEqual([]);
  });

  it("tells the reader that overrides exist", () => {
    // The mechanism is useless if nothing points at it: a reader who never
    // learns an override is possible writes their personal setup into the
    // committed file, which is the failure this whole split exists to prevent.
    const tracker = readFileSync(join(agentsDir, "issue-tracker.md"), "utf8");
    expect(tracker).toContain("issue-tracker.local.md");
  });
});
