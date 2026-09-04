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
       * The two knobs do different jobs, and getting the split wrong makes the
       * suite pass on a real change — which it did, once, before this comment.
       *
       * **`threshold` is per-pixel colour distance.** Playwright's default of
       * `0.2` is far too coarse for a palette: repointing dark `surface` from
       * `#10251a` to `#1a3326` moves each channel by about ten, lands well
       * inside `0.2`, and every affected pixel is scored *identical*. The whole
       * suite passed a deliberate palette break. `0.02` registers it.
       *
       * **`maxDiffPixelRatio` is how many pixels may differ at all**, and it
       * absorbs the thing `threshold` must not: text anti-aliasing, where a few
       * edge pixels differ enormously between runs on the same machine. Those
       * are numerous enough to notice and far fewer than 1% of the frame.
       *
       * So: strict about *how different* a pixel may be, forgiving about *how
       * many* may be. A colour change repaints a region and fails on count; a
       * subpixel wobble does not.
       */
      threshold: 0.02,
      maxDiffPixelRatio: 0.01,
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
