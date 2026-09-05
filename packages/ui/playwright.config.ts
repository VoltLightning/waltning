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
       * `maxDiffPixelRatio: 0.01` was the actual hole, not `threshold` — 1% of
       * this suite's 900×600 frame is 5,400 pixels, and a whole floating
       * button, a repointed palette, and a 44×26 toggle track all rendered
       * fewer differing pixels than that and passed. A *ratio* budget is
       * generous exactly where the frame is large, which is backwards: the
       * bigger the frame, the more a real defect can hide inside "1%".
       *
       * **`maxDiffPixels: 24` is an absolute count** — enough to absorb text
       * anti-aliasing (a few edge pixels differing between runs on the same
       * machine), nowhere near enough to absorb a control that changed.
       *
       * **`threshold: 0.2`** (Playwright's own default, loosened back up from
       * this suite's former `0.02`) is the per-pixel colour distance that
       * decides whether a pixel counts as "different" at all. With the count
       * budget this tight, `threshold` has to stay loose: at `0.02`, ordinary
       * anti-aliased edges register as different pixels on their own and blow
       * a 24-pixel budget on font rendering alone, before any real change. A
       * `0.02` threshold made sense only paired with the old percentage
       * budget it was compensating for; paired with an absolute one it only
       * produces false failures. A pixel that is *actually* wrong — a
       * repointed palette, a moved control — differs by far more than `0.2`
       * registers as identical, and still fails on count.
       *
       * Per-story exceptions, if a story's own text genuinely flickers
       * sub-pixel between runs, belong on that story's own `toHaveScreenshot`
       * call in `visual/stories.spec.ts` — never here, which is every story
       * at once.
       */
      threshold: 0.2,
      maxDiffPixels: 24,
      /** The spinner in `Button/Loading` never stops on its own. */
      animations: "disabled",
      caret: "hide",
    },
  },

  /**
   * One worker, deliberately.
   *
   * Parallel workers share the GPU and the font cache, and the resulting
   * one-pixel differences are indistinguishable from real ones. A visual suite
   * that is occasionally wrong is worse than a slower one that is not.
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
     */
    viewport: { width: 900, height: 600 },
    /**
     * A whole-number scale. On a Retina machine the default device pixel ratio
     * is 2 and the baselines double in size for no extra signal.
     */
    deviceScaleFactor: 1,
  },

  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],

  webServer: {
    command: `npx vite preview --outDir storybook-static --port ${PORT} --strictPort`,
    url: `http://localhost:${PORT}/iframe.html`,
    reuseExistingServer: true,
    timeout: 60_000,
  },
});
