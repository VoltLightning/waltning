/**
 * Two things about `tests/git-fixture.ts`: that it actually strips what it
 * claims to, and that it is the *only* place any test may invoke `git` with
 * a verb that writes.
 *
 * The second half exists because of the incident `tests/git-fixture.ts`'s
 * own header describes: a test that spawned `git init`/`add`/`commit`
 * itself, once, was enough to commit onto this branch's real history and
 * leave a stray identity in the shared `.git/config`. A rule that says "use
 * the fixture" is not a rule until something fails when it is not used —
 * this file is that something.
 */

import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { _internal } from "./git-fixture.ts";

const repoRoot = fileURLToPath(new URL("..", import.meta.url));
const HELPER_FILE = fileURLToPath(new URL("./git-fixture.ts", import.meta.url));
// This file itself is exempt from its own scan: the self-tests below need
// literal bait text that looks exactly like the violation being banned.
const THIS_FILE = fileURLToPath(import.meta.url);

describe("git-fixture.ts strips every inherited GIT_* variable (M-a)", () => {
  it("removes every GIT_* key, regardless of value", () => {
    const dirty = {
      GIT_DIR: "/somewhere/real/.git",
      GIT_INDEX_FILE: "/somewhere/real/.git/index",
      GIT_WORK_TREE: "/somewhere/real",
      GIT_EDITOR: "true",
      PATH: "/usr/bin",
      HOME: "/home/whoever",
    };
    const stripped = _internal.stripGitEnv(dirty);
    expect(Object.keys(stripped).filter((k) => k.startsWith("GIT_"))).toEqual([]);
    // Non-GIT_* keys survive — this is a filter, not a wipe.
    expect(stripped["PATH"]).toBe("/usr/bin");
    expect(stripped["HOME"]).toBe("/home/whoever");
  });

  it("passes a fully-stripped environment plus only the fixture's own keys", () => {
    const env = {
      PATH: "/usr/bin",
      GIT_CEILING_DIRECTORIES: "/tmp/some-dir",
      ..._internal.FIXTURE_IDENTITY,
    };
    expect(() => _internal.assertNoLeakedGitEnv(env)).not.toThrow();
  });

  it("throws — the M-a check that must run before git init — when a real GIT_* leaks through", () => {
    const leaked = {
      PATH: "/usr/bin",
      GIT_CEILING_DIRECTORIES: "/tmp/some-dir",
      ..._internal.FIXTURE_IDENTITY,
      GIT_DIR: "/somewhere/real/.git",
    };
    expect(() => _internal.assertNoLeakedGitEnv(leaked)).toThrow(/GIT_DIR/);
  });
});

describe("no raw mutating git call outside tests/git-fixture.ts (M-b)", () => {
  const MUTATING_VERBS = [
    "init",
    "add",
    "commit",
    "rm",
    "mv",
    "config",
    "checkout",
    "reset",
    "clean",
    "worktree",
  ];
  const EXEC_FUNCS = ["execFileSync", "execSync", "spawnSync", "spawn", "exec"];
  const CALL_START = new RegExp(`\\b(?:${EXEC_FUNCS.join("|")})\\s*\\(\\s*["']git["']`, "g");

  /** Every direct `exec*("git", …)` call in `text`, each as its full argument-list source text. */
  function rawGitCalls(text: string): string[] {
    const calls: string[] = [];
    for (const match of text.matchAll(CALL_START)) {
      const start = match.index ?? 0;
      let depth = 0;
      let end = start;
      for (let i = start; i < text.length; i++) {
        if (text[i] === "(") depth++;
        else if (text[i] === ")") {
          depth--;
          if (depth === 0) {
            end = i;
            break;
          }
        }
      }
      calls.push(text.slice(start, end + 1));
    }
    return calls;
  }

  function mutatingVerbsIn(callText: string): string[] {
    return MUTATING_VERBS.filter((verb) => new RegExp(`["']${verb}["']`).test(callText));
  }

  function tsFiles(dir: string, out: string[] = []): string[] {
    let entries: string[];
    try {
      entries = readdirSync(dir);
    } catch {
      return out;
    }
    for (const entry of entries) {
      if (entry === "node_modules" || entry === "dist" || entry === ".expo") continue;
      const full = join(dir, entry);
      if (statSync(full).isDirectory()) tsFiles(full, out);
      else if (/\.(ts|tsx)$/.test(entry)) out.push(full);
    }
    return out;
  }

  function candidateFiles(): string[] {
    const underTests = tsFiles(join(repoRoot, "tests")).filter(
      (f) => f !== HELPER_FILE && f !== THIS_FILE,
    );
    const underPackagesSrc: string[] = [];
    for (const pkg of readdirSync(join(repoRoot, "packages"))) {
      const srcDir = join(repoRoot, "packages", pkg, "src");
      try {
        if (!statSync(srcDir).isDirectory()) continue;
      } catch {
        continue;
      }
      underPackagesSrc.push(...tsFiles(srcDir).filter((f) => /\.test\.tsx?$/.test(f)));
    }
    return [...underTests, ...underPackagesSrc];
  }

  it("finds none — every candidate file goes through tests/git-fixture.ts instead", () => {
    const offenders: string[] = [];
    for (const file of candidateFiles()) {
      const text = readFileSync(file, "utf8");
      for (const call of rawGitCalls(text)) {
        const verbs = mutatingVerbsIn(call);
        if (verbs.length > 0) {
          offenders.push(`${relative(repoRoot, file)}: ${verbs.join(", ")}`);
        }
      }
    }
    expect(offenders, "raw mutating git calls outside tests/git-fixture.ts").toEqual([]);
  });

  // Broken once to prove it fires, by hand, before this file shipped:
  // temporarily appending a real `execFileSync("git", ["reset", "--hard"], …)`
  // call to the end of tests/verify-visual-gate.test.ts made the assertion
  // above fail, naming exactly that file and verb; reverting it made the
  // suite green again.
  it("the scanner itself catches a direct mutating call (self-test)", () => {
    const bait = 'execFileSync("git", ["commit", "-q", "-m", "bait"], { cwd: dir });';
    const calls = rawGitCalls(bait);
    expect(calls).toHaveLength(1);
    expect(mutatingVerbsIn(calls[0] ?? "")).toContain("commit");
  });

  it("the scanner does not flag the fixture's own delegating calls, or a read-only verb", () => {
    // Calling the *wrapper* named `git` (not `execFileSync` directly) is the
    // sanctioned shape, and must never itself look like a violation.
    expect(rawGitCalls('git(dir, ["commit", "-q", "-m", "init"]);')).toHaveLength(0);
    // A read-only verb through a direct call is out of this rule's scope —
    // only the ten mutating verbs above are banned outside the fixture.
    const readOnly = 'execFileSync("git", ["status"], { cwd: dir });';
    expect(mutatingVerbsIn(rawGitCalls(readOnly)[0] ?? "")).toEqual([]);
  });
});
