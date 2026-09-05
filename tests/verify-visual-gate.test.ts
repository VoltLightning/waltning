/**
 * `pnpm verify` and the pre-commit hook must agree on when the Playwright
 * visual suite is worth several minutes, and the hook must never be the
 * place that decides wrong.
 *
 * The decision lives in exactly one script, `.githooks/needs-visual.sh`,
 * driven by staged paths; the hook and `pnpm verify:fast`/`pnpm verify` are
 * the only two things that run afterward, so this file drives the real
 * script and the real git plumbing directly — the same way
 * `makefile.test.ts` runs `make help` rather than re-deriving what it
 * prints — instead of re-implementing either in TypeScript and asserting
 * against a second copy of the logic.
 *
 * It never actually runs Playwright, Biome, typecheck, or the test suite:
 * that is exactly the minutes this file exists to not pay for on every
 * commit.
 */

import { execFileSync } from "node:child_process";
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  rmSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, describe, expect, it } from "vitest";
import { assertIsolated, createTempGitRepo, git, removeTempGitRepo } from "./git-fixture.ts";

const repoRoot = fileURLToPath(new URL("..", import.meta.url));
const NEEDS_VISUAL = ".githooks/needs-visual.sh";

/** Runs `.githooks/needs-visual.sh` with `stagedPaths` on stdin, returns its exit code. */
function needsVisualExitCode(stagedPaths: string[]): number {
  try {
    execFileSync("sh", [NEEDS_VISUAL], {
      cwd: repoRoot,
      input: stagedPaths.length ? `${stagedPaths.join("\n")}\n` : "",
    });
    return 0;
  } catch (error) {
    const status = (error as { status: number | null }).status;
    return status ?? -1;
  }
}

/** Runs an arbitrary shell script by absolute path, returns its exit code. */
function runShellScript(absolutePath: string, input = ""): number {
  try {
    execFileSync("sh", [absolutePath], { input });
    return 0;
  } catch (error) {
    const status = (error as { status: number | null }).status;
    return status ?? -1;
  }
}

/**
 * The exit-code contract itself (H-1), independent of any shell text: only
 * a literal `1` may ever be read as "skip". This is what both
 * `.githooks/pre-commit` and `pnpm verify`'s callers must implement — an
 * undecidable answer (0, or anything unexpected) runs the suite.
 */
function isSkipSignal(exitCode: number): boolean {
  return exitCode === 1;
}

describe("needs-visual.sh — the trigger set is computed from staged paths (M-3)", () => {
  it.each([
    ["packages/ui/src/fx/amount.tsx", "a component"],
    [
      "packages/ui/package.json",
      "ui's own package.json — a react-native-web bump can move a pixel",
    ],
    ["packages/ui/.storybook/main.ts", "Storybook's own config"],
    ["packages/ui/visual/stories.spec.ts", "the visual spec itself"],
    ["packages/ui/visual/__screenshots__/Accounts-AccountCard--light.png", "a committed baseline"],
    ["packages/ui/playwright.config.ts", "this suite's own config"],
    ["packages/core/src/money.ts", "what Amount renders through"],
    ["packages/core/package.json", 'its exports map is what "resolves under src/" means'],
    ["pnpm-lock.yaml", "a dependency bump can move a pixel with no source change"],
  ])("needs the suite for %s (%s)", (path) => {
    expect(needsVisualExitCode([path])).toBe(0);
  });

  it.each([
    ["packages/core/README.md", "prose cannot move a pixel"],
    ["packages/core/tsconfig.json", "compiler options cannot move a pixel"],
    ["docs/specification/README.md", "a doc commit"],
    ["apps/api/drizzle/0002_x.sql", "a migration"],
  ])("does not need the suite for %s (%s)", (path) => {
    expect(needsVisualExitCode([path])).toBe(1);
  });

  it("does not need the suite for nothing staged", () => {
    expect(needsVisualExitCode([])).toBe(1);
  });

  it("needs the suite when a trigger path is staged alongside unrelated ones", () => {
    expect(
      needsVisualExitCode([
        "README.md",
        "packages/ui/src/shell/dual-total.tsx",
        "apps/api/src/index.ts",
      ]),
    ).toBe(0);
  });
});

describe("needs-visual.sh — only exit 1 skips; everything else runs the suite (H-1)", () => {
  it("exits 0 on a match, 1 on no match — the two decided answers", () => {
    expect(needsVisualExitCode(["packages/ui/src/x.tsx"])).toBe(0);
    expect(needsVisualExitCode(["docs/x.md"])).toBe(1);
  });

  it("a missing script fails closed: it does not exit 1", () => {
    const missing = join(repoRoot, ".githooks", "does-not-exist.sh");
    expect(existsSync(missing)).toBe(false);
    const code = runShellScript(missing);
    expect(code).not.toBe(1);
  });

  it("a script that errors instead of deciding fails closed: it does not exit 1", () => {
    const tmp = mkdtempSync(join(tmpdir(), "needs-visual-broken-"));
    const broken = join(tmp, "broken.sh");
    // Unmatched quote — a syntax error `sh` itself refuses, not a decision.
    writeFileSync(broken, "#!/bin/sh\necho 'unterminated\n");
    try {
      const code = runShellScript(broken);
      expect(code).not.toBe(1);
    } finally {
      rmSync(tmp, { recursive: true, force: true });
    }
  });

  it("the skip-signal contract itself treats only exit 1 as skip", () => {
    expect(isSkipSignal(1)).toBe(true);
    expect(isSkipSignal(0)).toBe(false);
    expect(isSkipSignal(2)).toBe(false);
    expect(isSkipSignal(127)).toBe(false);
    expect(isSkipSignal(-1)).toBe(false);
  });

  it("the hook implements the same contract: only `-eq 1` skips, and there is no early exit before the checks", () => {
    const hook = readFileSync(new URL("../.githooks/pre-commit", import.meta.url), "utf8");
    expect(hook).toMatch(/\$decision"\s+-eq\s+1/);
    // The bug this guards: `if command-that-can-fail; then …` treats *any*
    // nonzero exit as the else branch — the fail-open shape H-1 found.
    expect(hook).not.toMatch(/if\s+printf[^|]*\|\s*sh\s+\.githooks\/needs-visual\.sh;\s*then/);
    // A bare `exit 0` right after computing `$staged` is the H-2 bug: it
    // skipped Biome, typecheck, and tests whenever the filtered list was
    // empty (a delete-only commit, before `D` was added to the filter).
    expect(hook).not.toMatch(/staged=\$\([^)]*\)\nif \[ -z "\$staged" \]; then\n\s*exit 0/);
  });
});

describe("the ui→core trace needs-visual.sh assumes (M-2)", () => {
  const uiPkg: { dependencies?: Record<string, string>; devDependencies?: Record<string, string> } =
    JSON.parse(readFileSync(new URL("../packages/ui/package.json", import.meta.url), "utf8"));
  const coreExports: Record<string, string> = JSON.parse(
    readFileSync(new URL("../packages/core/package.json", import.meta.url), "utf8"),
  ).exports;

  it("packages/ui depends on exactly @waltning/core among workspace packages, dependencies or devDependencies (L-e)", () => {
    const workspaceDeps = Object.keys({ ...uiPkg.dependencies, ...uiPkg.devDependencies }).filter(
      (name) => name.startsWith("@waltning/"),
    );
    expect(
      workspaceDeps,
      "packages/ui/package.json's @waltning/* dependencies (or devDependencies) changed — " +
        ".githooks/needs-visual.sh assumes packages/core is the only one and " +
        "needs its trigger set updated if that is no longer true",
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
    expect(needsVisualExitCode(staged)).toBe(0);

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
    expect(needsVisualExitCode(staged)).toBe(0);

    // The bug this regresses: git's default rename detection collapses this
    // to a single `R100` pair, and `--name-only` without `--no-renames`
    // shows only the destination — the source path (the one that actually
    // matters, since it used to be under packages/ui/) disappears.
    const withRenameDetection = git(dir, ["diff", "--cached", "--name-only", "--diff-filter=ACMR"]);
    expect(withRenameDetection.split("\n").filter(Boolean)).toEqual(["docs/movable.tsx"]);
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

  it("section 2's blocked-shape and CSV checks read $present, not $staged (L-d)", () => {
    expect(hook).toMatch(
      /present=\$\(git diff --cached --name-only --diff-filter=ACMR --no-renames\)/,
    );
    const section2 = hook.slice(hook.indexOf("── 2 ·"), hook.indexOf("── 3 ·"));
    expect(section2).toContain("printf '%s\\n' \"$present\"");
    expect(section2).not.toContain("printf '%s\\n' \"$staged\"");
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

  it("routes the hook's decision through needs-visual.sh into pnpm verify:fast or pnpm verify, not a second copy of either", () => {
    expect(hook).toContain(".githooks/needs-visual.sh");
    expect(hook).toContain("pnpm verify:fast");
    expect(hook).toMatch(/if\s+!\s+pnpm\s+verify;\s+then/);
    // The pattern the very first version hand-rolled must not reappear.
    expect(hook).not.toMatch(/packages\/\(ui\|core\)\//);
  });

  it("cites needs-visual.sh as the trigger set's source rather than restating it (L-b)", () => {
    // The hook's own comment and its runtime skip message must both point at
    // needs-visual.sh instead of each keeping their own copy of the trigger
    // list — three places (this file included) is one too many to trust
    // staying in sync by hand.
    const printfLine = hook.split("\n").find((line) => line.includes("running pnpm verify:fast"));
    expect(printfLine, "the hook's skip message").toBeDefined();
    expect(printfLine).toContain(".githooks/needs-visual.sh");
    expect(printfLine).not.toMatch(/packages\/ui\/|packages\/core\/src\//);
  });
});
