/**
 * The two hooks must run the same checks and differ only in scope, and neither
 * may be the place that quietly decides not to run them.
 *
 * Commit calls `pnpm verify:changed`, push calls `pnpm verify`. What each
 * covers lives in `tools/verify-changed.sh` and `tools/affected/stories.mjs`,
 * tested against the real scripts in `affected-stories.test.ts`; this file
 * drives the real hooks and the real git plumbing — the same way
 * `makefile.test.ts` runs `make help` rather than re-deriving what it prints —
 * instead of re-implementing either in TypeScript and asserting against a
 * second copy of the logic.
 *
 * It never actually runs Playwright, Biome, typecheck, or the test suite:
 * that is exactly the minutes this file exists to not pay for on every
 * commit.
 */

import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, readdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, describe, expect, it } from "vitest";
import { assertIsolated, createTempGitRepo, git, removeTempGitRepo } from "./git-fixture.ts";

const repoRoot = fileURLToPath(new URL("..", import.meta.url));
/**
 * What `tools/affected/stories.mjs` decides for a changeset.
 *
 * The real script, not a copy of its rules: `affected-stories.test.ts` covers
 * the mapping itself, and what the cases here add is that the paths git
 * *actually stages* — a delete, a move — reach it in a form it can answer for.
 */
function decideFor(files: readonly string[]): string {
  return execFileSync("node", ["tools/affected/stories.mjs", "--files", ...files], {
    cwd: repoRoot,
    encoding: "utf8",
  }).trim();
}

describe("the ui→core trace the affected-story map assumes (M-2)", () => {
  const uiPkg: {
    dependencies?: Record<string, string>;
    devDependencies?: Record<string, string>;
    peerDependencies?: Record<string, string>;
  } = JSON.parse(readFileSync(new URL("../packages/ui/package.json", import.meta.url), "utf8"));
  const coreExports: Record<string, string> = JSON.parse(
    readFileSync(new URL("../packages/core/package.json", import.meta.url), "utf8"),
  ).exports;

  it("packages/ui depends on exactly @waltning/core across all three dependency fields (L-5)", () => {
    // All three, not two. `peerDependencies` is how this package already
    // declares react, react-native and reanimated, so it is the field a
    // workspace dependency would most naturally be added to next — and a
    // floor that reads two of the three fields is a floor with a gap in the
    // shape of the field the package actually uses.
    expect(
      uiPkg.peerDependencies,
      "packages/ui declares peerDependencies — if that stops being true this check is reading nothing",
    ).toBeDefined();

    const workspaceDeps = Object.keys({
      ...uiPkg.dependencies,
      ...uiPkg.devDependencies,
      ...uiPkg.peerDependencies,
    }).filter((name) => name.startsWith("@waltning/"));
    expect(
      workspaceDeps,
      "packages/ui/package.json's @waltning/* dependencies, devDependencies or " +
        "peerDependencies changed — .githooks/needs-visual.sh assumes packages/core " +
        "is the only one and needs its trigger set updated if that is no longer true",
    ).toEqual(["@waltning/core"]);
  });

  function sourceFiles(dir: string, out: string[] = []): string[] {
    for (const entry of readdirSync(dir)) {
      const full = join(dir, entry);
      if (statSync(full).isDirectory()) sourceFiles(full, out);
      else if (/\.(ts|tsx)$/.test(entry)) out.push(full);
    }
    return out;
  }

  function resolveExport(subpath: string): string | undefined {
    if (Object.hasOwn(coreExports, `./${subpath}`)) return coreExports[`./${subpath}`];
    for (const [key, value] of Object.entries(coreExports)) {
      if (key.endsWith("/*") && subpath.startsWith(key.slice(2, -1))) return value;
    }
    return undefined;
  }

  it("every @waltning/core subpath packages/ui imports — from src/, .storybook/, or visual/ — resolves under packages/core/src/ (L-e)", () => {
    const IMPORT = /from\s+["']@waltning\/core\/([^"']+)["']/g;
    // Not just src/: a story or the Storybook config itself importing
    // money.ts for fixture data is exactly as capable of affecting a
    // rendered pixel as anything under src/.
    const roots = ["src", ".storybook", "visual"].map((dir) =>
      fileURLToPath(new URL(`../packages/ui/${dir}`, import.meta.url)),
    );
    const subpaths = new Set<string>();
    for (const root of roots) {
      for (const file of sourceFiles(root)) {
        for (const match of readFileSync(file, "utf8").matchAll(IMPORT)) {
          if (match[1]) subpaths.add(match[1]);
        }
      }
    }

    expect(
      subpaths.size,
      "no @waltning/core imports found — the scanner itself is broken",
    ).toBeGreaterThan(0);

    for (const subpath of subpaths) {
      const target = resolveExport(subpath);
      expect(
        target,
        `@waltning/core/${subpath} is imported by packages/ui but not in packages/core/package.json's ` +
          "exports map — .githooks/needs-visual.sh's packages/core/src/ pattern no longer covers everything ui depends on",
      ).toBeDefined();
      expect(
        target?.startsWith("./src/"),
        `@waltning/core/${subpath} resolves to ${target}, which is not under ./src/ — ` +
          ".githooks/needs-visual.sh's packages/core/src/ pattern needs updating",
      ).toBe(true);
    }
  });
});

describe("real staged state, not hand-written paths (H-2, M-1)", () => {
  const tmpDirs: string[] = [];

  function stagedPaths(dir: string): string[] {
    assertIsolated(dir);
    return git(dir, ["diff", "--cached", "--name-only", "--diff-filter=ACMRD", "--no-renames"])
      .split("\n")
      .filter(Boolean);
  }

  /** The hook's `$present`: the same list, minus deletions. */
  function presentPaths(dir: string): string[] {
    assertIsolated(dir);
    return git(dir, ["diff", "--cached", "--name-only", "--diff-filter=ACMR", "--no-renames"])
      .split("\n")
      .filter(Boolean);
  }

  /** What section 1's `git check-ignore -q --no-index` answers for one path. */
  function isIgnored(dir: string, path: string): boolean {
    try {
      git(dir, ["check-ignore", "-q", "--no-index", "--", path]);
      return true;
    } catch {
      return false;
    }
  }

  afterEach(() => {
    while (tmpDirs.length) {
      const dir = tmpDirs.pop();
      if (dir) removeTempGitRepo(dir);
    }
  });

  it("H-2: a delete-only commit still stages the deleted path, and the suite is needed for a deleted ui file", () => {
    const dir = createTempGitRepo();
    tmpDirs.push(dir);
    const target = join(dir, "packages", "ui", "src");
    mkdirSync(target, { recursive: true });
    writeFileSync(join(target, "component.tsx"), "export {};\n");
    assertIsolated(dir);
    git(dir, ["add", "-A"]);
    git(dir, ["commit", "-q", "-m", "init"]);

    assertIsolated(dir);
    git(dir, ["rm", "-q", "packages/ui/src/component.tsx"]);

    const staged = stagedPaths(dir);
    expect(staged, "a delete-only commit must still show up in the staged-path list").toEqual([
      "packages/ui/src/component.tsx",
    ]);
    expect(decideFor(staged), "a deleted ui file cannot be mapped").toBe("ALL");

    // The bug this regresses: the old `--diff-filter=ACMR` (no `D`) computed
    // an empty list for exactly this commit, which — combined with the old
    // hook's early `exit 0` on an empty list — skipped Biome, typecheck, and
    // tests entirely, not just the visual suite.
    const withoutD = git(dir, ["diff", "--cached", "--name-only", "--diff-filter=ACMR"]);
    expect(withoutD.trim()).toBe("");
  });

  it("M-1: moving a file out of packages/ui/ still stages the old path, and the suite is needed", () => {
    const dir = createTempGitRepo();
    tmpDirs.push(dir);
    const uiSrc = join(dir, "packages", "ui", "src");
    const docs = join(dir, "docs");
    mkdirSync(uiSrc, { recursive: true });
    mkdirSync(docs, { recursive: true });
    writeFileSync(join(uiSrc, "movable.tsx"), "export {};\n");
    assertIsolated(dir);
    git(dir, ["add", "-A"]);
    git(dir, ["commit", "-q", "-m", "init"]);

    assertIsolated(dir);
    git(dir, ["mv", "packages/ui/src/movable.tsx", "docs/movable.tsx"]);

    const staged = stagedPaths(dir);
    expect(staged.sort()).toEqual(["docs/movable.tsx", "packages/ui/src/movable.tsx"]);
    expect(decideFor(staged), "a moved ui file cannot be mapped").toBe("ALL");

    // The bug this regresses: git's default rename detection collapses this
    // to a single `R100` pair, and `--name-only` without `--no-renames`
    // shows only the destination — the source path (the one that actually
    // matters, since it used to be under packages/ui/) disappears.
    const withRenameDetection = git(dir, ["diff", "--cached", "--name-only", "--diff-filter=ACMR"]);
    expect(withRenameDetection.split("\n").filter(Boolean)).toEqual(["docs/movable.tsx"]);
  });

  it("L-1: deleting a force-added gitignored file does not reach the force-add check", () => {
    // Section 1 asks `git check-ignore` about every path it is given. A
    // force-added path stays gitignored forever, so on the commit that
    // *removes* it that question still answers "yes" — and the hook refused
    // the cleanup commit. The fix is the input, not the question: section 1
    // reads `$present`, which has no deletions in it.
    const dir = createTempGitRepo();
    tmpDirs.push(dir);
    writeFileSync(join(dir, ".gitignore"), "secret.txt\n");
    writeFileSync(join(dir, "secret.txt"), "x\n");
    git(dir, ["add", "-A"]);
    git(dir, ["add", "-f", "secret.txt"]);
    git(dir, ["commit", "-q", "-m", "init"]);

    // Still ignored while tracked — this is the answer that used to block.
    expect(isIgnored(dir, "secret.txt")).toBe(true);

    git(dir, ["rm", "-q", "secret.txt"]);

    expect(
      stagedPaths(dir),
      "the deletion is in $staged, where the gate decision needs it",
    ).toEqual(["secret.txt"]);
    expect(presentPaths(dir), "and not in $present, which section 1 reads").toEqual([]);
  });

  it("L-d: deleting a secret-shaped file does not appear in the blocked-shape check's input", () => {
    // Section 2 of the hook must not refuse a commit that only *removes* a
    // `.env`/`.sqlite`/etc. file — that is cleanup, not the shape the check
    // exists to catch. It computes its own `present` list with
    // `--diff-filter=ACMR` (no `D`), separate from `$staged`; this proves
    // the git plumbing that list depends on actually excludes a deletion.
    const dir = createTempGitRepo();
    tmpDirs.push(dir);
    writeFileSync(join(dir, ".env"), "SECRET=x\n");
    git(dir, ["add", "-A"]);
    git(dir, ["commit", "-q", "-m", "init"]);

    git(dir, ["rm", "-q", ".env"]);

    const present = git(dir, [
      "diff",
      "--cached",
      "--name-only",
      "--diff-filter=ACMR",
      "--no-renames",
    ]);
    expect(present.trim()).toBe("");
  });
});

describe("package.json and the hook share one decision, with no environment override (M-4)", () => {
  const hook = readFileSync(new URL("../.githooks/pre-commit", import.meta.url), "utf8");
  const scripts: Record<string, string> = JSON.parse(
    readFileSync(new URL("../package.json", import.meta.url), "utf8"),
  ).scripts;

  it("sections 1 and 2 both read $present, not $staged (L-1, L-d)", () => {
    expect(hook).toMatch(
      /present=\$\(git diff --cached --name-only --diff-filter=ACMR --no-renames\)/,
    );
    const section1 = hook.slice(hook.indexOf("── 1 ·"), hook.indexOf("── 2 ·"));
    const section2 = hook.slice(hook.indexOf("── 2 ·"), hook.indexOf("── 3 ·"));
    for (const section of [section1, section2]) {
      expect(section).toContain("printf '%s\\n' \"$present\"");
      // Section 1 asked git whether each path is ignored. Fed `$staged`, it
      // asked that about deleted paths too — so removing a file that had
      // once been force-added past .gitignore failed the commit that
      // removed it, which is the opposite of what this hook wants.
      expect(section).not.toContain("printf '%s\\n' \"$staged\"");
    }
    // `present` is computed once, ahead of both, rather than between them.
    expect(hook.indexOf("present=$(")).toBeLessThan(hook.indexOf("── 1 ·"));
  });

  it("verify:fast is everything but Playwright; verify is verify:fast plus the visual suite", () => {
    expect(scripts["verify:fast"]).toBeDefined();
    expect(scripts["verify:fast"]).not.toContain("test:visual");
    expect(scripts["verify:fast"]).toContain("pnpm check");
    expect(scripts["verify:fast"]).toContain("pnpm typecheck");
    expect(scripts["verify:fast"]).toContain("pnpm test");
    expect(scripts["verify"]).toContain("test:visual");
  });

  it("has no environment-variable path that can downgrade pnpm verify", () => {
    expect(hook).not.toContain("VERIFY_VISUAL");
    expect(JSON.stringify(scripts)).not.toContain("VERIFY_VISUAL");
    expect(existsSync(new URL("../.githooks/verify-visual-gate.sh", import.meta.url))).toBe(false);
  });

  it("routes commit through verify:changed and push through verify, not a second copy of either", () => {
    // **The two hooks run the same checks and differ only in scope.** A
    // commit-time gate that ran a *different* set would make the push a
    // surprise; one that ran the same set at full size would be skipped.
    expect(hook).toMatch(/if\s+!\s+pnpm\s+verify:changed;\s+then/);
    expect(hook).not.toContain("pnpm verify:fast");
    const push = readFileSync(new URL("../.githooks/pre-push", import.meta.url), "utf8");
    expect(push).toMatch(/if\s+!\s+pnpm\s+verify;\s+then/);
    // The pattern the very first version hand-rolled must not reappear.
    expect(hook).not.toMatch(/packages\/\(ui\|core\)\//);
  });

  it("keeps the scoping in one script, cited rather than restated (L-b)", () => {
    // Three places that each keep their own copy of what a change can reach is
    // one too many to trust staying in sync by hand. The hook points at the
    // script; it does not list paths of its own.
    expect(hook).toContain("tools/verify-changed.sh");
    expect(hook).not.toMatch(/packages\/ui\/src\/tokens|packages\/core\/src\//);
  });
});
