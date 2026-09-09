/**
 * `tools/affected/stories.mjs` decides which visual stories a commit can move.
 *
 * **The only failure that matters is a silent miss**, so every case here asks
 * the same question: does it still run enough? A pattern that runs too much
 * costs seconds; one that runs too little lets a palette regression through a
 * gate whose whole reason for existing is that jsdom cannot see one.
 *
 * The script is run for real against the real index, the way
 * `verify-visual-gate.test.ts` runs the hook rather than re-deriving it. A
 * second copy of the mapping in TypeScript would be a second thing to keep
 * current, and it is always the copy nobody looks at that goes wrong.
 */

import { execFileSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const repoRoot = fileURLToPath(new URL("..", import.meta.url));
const INDEX = `${repoRoot}packages/ui/storybook-static/index.json`;

/** The script's answer for a hand-given changeset, without touching git. */
function decide(files: readonly string[]): string {
  return execFileSync("node", ["tools/affected/stories.mjs", "--files", ...files], {
    cwd: repoRoot,
    encoding: "utf8",
  }).trim();
}

describe("what a change can reach", () => {
  it("runs nothing when nothing under packages/ui changed", () => {
    expect(decide(["docs/specification/screens/S04-today.md"])).toBe("NONE");
    expect(decide(["apps/api/src/modules/accounts/create-account.ts"])).toBe("NONE");
  });

  it("runs everything for a file every story reads", () => {
    // A token, a theme role or a locale reaches every component drawn. So does
    // the harness itself: a changed Playwright config or spec changes what
    // every screenshot means.
    for (const file of [
      "packages/ui/src/tokens.ts",
      "packages/ui/src/theme/roles.ts",
      "packages/ui/src/i18n/en.ts",
      "packages/ui/.storybook/preview.tsx",
      "packages/ui/visual/stories.spec.ts",
      "packages/ui/playwright.config.ts",
      "pnpm-lock.yaml",
    ]) {
      expect(decide([file]), file).toBe("ALL");
    }
  });

  it("runs a changed component's own stories", () => {
    expect(decide(["packages/ui/src/shell/molecules/pager-header/pager-header.tsx"])).toBe(
      "Shell/PagerHeader",
    );
  });

  it("runs the stories of everything that renders a changed component", () => {
    // **The half a naive version gets wrong.** `DayCell` has no story of its
    // own; the ribbon and the grid draw it, and they are what a change to it
    // can move on screen.
    const reached = decide(["packages/ui/src/transactions/atoms/day-cell/day-cell.tsx"]).split("|");
    expect(reached).toContain("Transactions/DayRibbon");
    expect(reached).toContain("Transactions/MonthGrid");
  });

  it("runs everything rather than nothing when it cannot map a change", () => {
    // A hole in the map is not a component without tests. The fallback is the
    // slow answer, never the empty one.
    expect(decide(["packages/ui/src/some-file-that-does-not-exist.ts"])).toBe("ALL");
    expect(decide(["packages/ui/README.md"])).toBe("ALL");
  });

  it("widens to everything as soon as one file in the set is unmappable", () => {
    // Mixed changesets take the wider answer: a mappable component beside an
    // unmappable file must not narrow the run down to the component.
    expect(
      decide([
        "packages/ui/src/shell/molecules/pager-header/pager-header.tsx",
        "packages/ui/src/tokens.ts",
      ]),
    ).toBe("ALL");
  });

  it("names titles the visual suite actually has", () => {
    // A pattern that matches nothing runs nothing, and passes. This is the
    // check that the names are real.
    if (!existsSync(INDEX)) return;
    const index = JSON.parse(readFileSync(INDEX, "utf8")) as {
      entries: Record<string, { type?: string; title?: string }>;
    };
    const known = new Set(
      Object.values(index.entries)
        .filter((entry) => entry.type === "story")
        .map((entry) => entry.title),
    );
    for (const title of decide(["packages/ui/src/transactions/atoms/day-cell/day-cell.tsx"]).split(
      "|",
    )) {
      expect(known, title).toContain(title);
    }
  });
});
