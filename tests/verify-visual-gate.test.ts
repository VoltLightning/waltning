/**
 * `pnpm verify` and the pre-commit hook must agree on when the Playwright
 * visual suite is worth nine minutes.
 *
 * Two places that both decide "does this diff need Playwright" is two
 * places that drift, so the decision lives in exactly one script each side
 * calls: `.githooks/needs-visual.sh` turns staged paths into "needed or
 * not", and `.githooks/verify-visual-gate.sh` turns `VERIFY_VISUAL` into
 * "skip or fall through to the real suite". This test drives both scripts
 * directly — the same way `makefile.test.ts` runs `make help` rather than
 * re-deriving what it prints — instead of re-implementing their patterns in
 * TypeScript and asserting against a second copy of the logic.
 *
 * It never actually runs Playwright: that is exactly the nine minutes this
 * suite exists to not pay for on every commit.
 */

import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const repoRoot = fileURLToPath(new URL("..", import.meta.url));

function needsVisual(stagedPaths: string[]): boolean {
  try {
    execFileSync("sh", [".githooks/needs-visual.sh"], {
      cwd: repoRoot,
      input: stagedPaths.length ? `${stagedPaths.join("\n")}\n` : "",
    });
    return true;
  } catch {
    return false;
  }
}

function visualGate(env: Record<string, string | undefined>): { skipped: boolean; output: string } {
  try {
    const output = execFileSync("sh", [".githooks/verify-visual-gate.sh"], {
      cwd: repoRoot,
      env: { ...process.env, ...env },
      encoding: "utf8",
    });
    return { skipped: true, output };
  } catch (error) {
    const { stdout } = error as { stdout: string };
    return { skipped: false, output: stdout };
  }
}

describe("needs-visual.sh — the skip condition is computed from staged paths", () => {
  it("needs the suite when packages/ui changed", () => {
    expect(needsVisual(["packages/ui/src/fx/amount.tsx"])).toBe(true);
  });

  it("needs the suite when packages/core/src changed — this is what Amount renders through", () => {
    expect(needsVisual(["packages/core/src/money.ts"])).toBe(true);
  });

  it("needs the suite when either changed alongside unrelated files", () => {
    expect(
      needsVisual(["README.md", "packages/ui/src/shell/dual-total.tsx", "apps/api/src/index.ts"]),
    ).toBe(true);
  });

  it("does not need the suite for a doc or migration commit", () => {
    expect(needsVisual(["docs/specification/README.md", "apps/api/drizzle/0002_x.sql"])).toBe(
      false,
    );
  });

  it("does not need the suite for nothing staged", () => {
    expect(needsVisual([])).toBe(false);
  });

  // packages/core/package.json, its README, and its tsconfig cannot move a
  // pixel — only packages/core/src/ can, per that package's own `exports`
  // map. A pattern that matched all of packages/core/ would run Playwright
  // on a dependency bump or a doc edit, which is the false positive this
  // test exists to catch.
  it("does not need the suite for packages/core outside src/", () => {
    expect(needsVisual(["packages/core/package.json", "packages/core/README.md"])).toBe(false);
  });
});

describe("verify-visual-gate.sh — the full run is the default", () => {
  it("does not skip with VERIFY_VISUAL unset — pnpm verify with no env still runs everything", () => {
    const env = { ...process.env };
    delete env["VERIFY_VISUAL"];
    delete env["VERIFY_VISUAL_REASON"];
    expect(visualGate(env).skipped).toBe(false);
  });

  it("does not skip with VERIFY_VISUAL=1", () => {
    expect(visualGate({ VERIFY_VISUAL: "1" }).skipped).toBe(false);
  });

  it("skips with VERIFY_VISUAL=0 and prints a line saying why", () => {
    const { skipped, output } = visualGate({ VERIFY_VISUAL: "0" });
    expect(skipped).toBe(true);
    expect(output.trim().split("\n")).toHaveLength(1);
    expect(output).toMatch(/skip/i);
  });

  it("reports the hook's staged-path finding when it set one", () => {
    const { output } = visualGate({
      VERIFY_VISUAL: "0",
      VERIFY_VISUAL_REASON: "no packages/ui or packages/core/src/ file staged",
    });
    expect(output).toContain("no packages/ui or packages/core/src/ file staged");
  });
});

describe("the hook and pnpm verify call the same gate", () => {
  const hook = readFileSync(new URL("../.githooks/pre-commit", import.meta.url), "utf8");
  const scripts: Record<string, string> = JSON.parse(
    readFileSync(new URL("../package.json", import.meta.url), "utf8"),
  ).scripts;

  it("routes the hook's visual step through needs-visual.sh, not a second copy of the pattern", () => {
    expect(hook).toContain(".githooks/needs-visual.sh");
    // The pattern the old hook hand-rolled (`packages/(ui|core)/`) must not
    // reappear — that is exactly the duplicate this test guards against.
    expect(hook).not.toMatch(/packages\/\(ui\|core\)\//);
  });

  it("has the hook set VERIFY_VISUAL for pnpm verify's own gate to read", () => {
    expect(hook).toMatch(/VERIFY_VISUAL=1/);
    expect(hook).toMatch(/VERIFY_VISUAL=0/);
    expect(hook).toContain("pnpm run verify:visual");
  });

  it("has pnpm verify call the same gate script the hook drives", () => {
    expect(scripts["verify"]).toContain("verify:visual");
    expect(scripts["verify:visual"]).toContain(".githooks/verify-visual-gate.sh");
    expect(scripts["verify:visual"]).toContain("pnpm test:visual");
  });
});
