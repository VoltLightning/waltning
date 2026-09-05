/**
 * Screenshot diffing over the built Storybook.
 *
 * This is the check `stories.test.tsx` cannot be. jsdom has no layout and no
 * rendered colour, so that suite proves a story mounts and satisfies structural
 * axe — and would pass a component that had turned invisible. A real browser is
 * the only thing that sees what the design system is *for*.
 *
 * **Against the static build, not the dev server.** `storybook build` is
 * deterministic and already runs in the gate; `storybook dev` recompiles on
 * demand, so a screenshot taken during a rebuild is a flake nobody can
 * reproduce. Served by `vite preview`, which `packages/ui` already depends on —
 * a static file server is not worth a new dependency.
 */

import { createHash } from "node:crypto";
import { fileURLToPath } from "node:url";
import { defineConfig, devices } from "@playwright/test";

/**
 * **One port per checkout.** `reuseExistingServer` is right for one person on
 * one machine — a rebuild does not wait for a second preview server — and
 * wrong for parallel worktrees on a fixed port: worktree B's suite reused
 * worktree A's server and screenshotted A's stories against B's baselines.
 * The port is derived from this file's own path, the same way the test
 * database template is, so each checkout reuses only its own server.
 */
const PORT =
  6007 +
  (Number.parseInt(
    createHash("sha1")
      .update(fileURLToPath(import.meta.url))
      .digest("hex")
      .slice(0, 6),
    16,
  ) %
    900);

export default defineConfig({
  testDir: "./visual",

  /**
   * Baselines live beside the spec rather than in Playwright's default
   * `-snapshots` sibling directory, so the whole visual concern is one folder
   * that can be looked at, reviewed, or deleted as a unit.
   */
  snapshotPathTemplate: "./visual/__screenshots__/{arg}{ext}",

  /**
   * **Fail rather than write** when a baseline is missing.
   *
   * Playwright's default writes the missing snapshot and passes on the first
   * run, which means a new story silently establishes whatever it happened to
   * render — including a regression — as the thing everything is compared
   * against. Updating is an explicit act: `pnpm test:visual:update`.
   */
  updateSnapshots: "missing",

  expect: {
    toHaveScreenshot: {
      /**
       * `threshold` is pixelmatch's own per-pixel cutoff, not a fraction of
       * the frame: a pixel counts as "different" once its YIQ colour delta
       * exceeds `35215 × threshold²`. At the previous `0.2` that cutoff is
       * 1,408 — so a `#f4ecdf` → `#ffffff` fill (delta 190) or a full
       * pre-#77 → post-#77 accent repoint (delta 397) both register as the
       * *same* pixel, and `maxDiffPixels` never sees them: 73 of this PR's
       * own 129 re-captured baselines scored **zero** differing pixels
       * against `threshold: 0.2`. Anti-aliasing is not what `0.2` was
       * protecting — pixelmatch already excludes anti-aliased edges from the
       * count on its own (`antialiased()`, `packages/utils/third_party/pixelmatch.js`),
       * regardless of `threshold` — so loosening it bought nothing but
       * blindness to colour.
       *
       * **`threshold: 0.02`** (delta cutoff ≈14) is tight enough to catch
       * both examples above and loose enough to survive real font
       * anti-aliasing noise between runs on one machine: of this PR's own 129
       * re-captured baselines, 34 are pixel-for-pixel identical at this
       * threshold — the same source re-encoded, nothing to see — and none of
       * the rest differ by more than 4 pixels unless something in the frame
       * actually changed. The smallest *real* change in that same set (a
       * fixture's account count going from 21 to 20 — one digit) differs by
       * 38; the largest (a sheet gaining a whole counterparty row) differs by
       * over 240,000.
       *
       * **`maxDiffPixels: 50`** sits just above that measured noise ceiling
       * (4) and below almost every real defect this PR's own re-captures
       * contain — the one exception being single-character text edits like
       * the digit above, which `stories.test.tsx`'s own render assertions
       * already cover; this suite's job is layout and colour, not counting
       * characters.
       *
       * Per-story exceptions, if a story's own text genuinely flickers
       * sub-pixel between runs, belong on that story's own `toHaveScreenshot`
       * call in `visual/stories.spec.ts` — never here, which is every story
       * at once.
       */
      threshold: 0.02,
      maxDiffPixels: 50,
      /** The spinner in `Button/Loading` never stops on its own. */
      animations: "disabled",
      caret: "hide",
    },
  },

  /**
   * One worker, deliberately.
   *
   * There is nothing to gain by raising this today: `testDir` holds exactly
   * one spec file, and without `fullyParallel` Playwright shards work by
   * file, not by test. `--workers=4` against this suite still prints
   * `Running 1097 tests using 1 worker` and finishes in the same ~9 minutes
   * as `workers: 1` — measured three consecutive runs, 1097/1097 passing
   * every time, no story that failed at one worker and not the other or vice
   * versa. Raising the number here changes nothing until the suite is split
   * across files or `fullyParallel` is turned on, and turning that on is the
   * GPU-and-font-cache-sharing risk this config exists to avoid: real
   * concurrent capture, not a config number, is what turns into one-pixel
   * differences indistinguishable from a regression. A visual suite that is
   * occasionally wrong is worse than a slower one that is not.
   */
  workers: 1,

  /**
   * **No retries.** A screenshot that passes on the second attempt did not
   * pass; it was flaky, and retrying hides exactly the instability this config
   * spends its determinism budget preventing.
   */
  retries: 0,

  /**
   * No `CI` branch. Playwright's scaffold keys the reporter off `process.env.CI`
   * and `env-parity.test.ts` refused it — correctly, because **there is no CI
   * here**: `CLAUDE.md` says the pre-commit hook is the gate. A variable read
   * for a machine that does not exist is a branch nothing ever takes.
   */
  reporter: [["list"], ["html", { open: "never" }]],

  use: {
    baseURL: `http://localhost:${PORT}`,
    ...devices["Desktop Chrome"],
    /**
     * Pinned, because a screenshot is a function of viewport. Storybook's
     * default frame would otherwise decide the baselines.
     *
     * **This pin was dead.** `projects[0]` used to spread
     * `...devices["Desktop Chrome"]` a second time into its own `use`, which
     * carries `devices["Desktop Chrome"]`'s own 1280×720 viewport — a
     * project's `use` is merged *over* this top-level one, not under it, so
     * every baseline actually rendered at 1280×720 regardless of what this
     * object said. 76 of this suite's baselines are exactly 1280×720; the
     * other 108 distinct frame sizes are `#storybook-root` sized to its
     * story's own content, which is why they varied at all. The fix is to
     * let every project inherit this `use` unspread, since there is exactly
     * one project and nothing left for it to override.
     */
    viewport: { width: 900, height: 600 },
    /**
     * A whole-number scale. On a Retina machine the default device pixel ratio
     * is 2 and the baselines double in size for no extra signal.
     */
    deviceScaleFactor: 1,
  },

  projects: [{ name: "chromium" }],

  webServer: {
    command: `npx vite preview --outDir storybook-static --port ${PORT} --strictPort`,
    url: `http://localhost:${PORT}/iframe.html`,
    reuseExistingServer: true,
    timeout: 60_000,
  },
});
