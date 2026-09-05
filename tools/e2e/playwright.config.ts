/**
 * Tier 2 — Playwright against the real Expo web build, on demand.
 *
 * `pnpm e2e` only. Nothing here runs from `pnpm verify` or any merge script
 * — see `src/smoke.ts`'s own header for why a check that depends on a
 * process someone remembered to start cannot be the gate.
 *
 * **No `webServer` block.** `packages/ui/playwright.config.ts` starts its own
 * preview server because the thing under test — a Storybook build — has no
 * other reason to be running. Here the thing under test is the whole stack:
 * the API, pointed at a database that does not exist until `globalSetup`
 * creates it, and Expo web, which needs neither — it holds its own OPFS
 * ledger and never talks to this run's API (arc-phone is local-first).
 * `globalSetup` (`setup/global.ts`) starts and stops both itself, in the one
 * order that works. `setup/global.ts`'s own header has the full sequencing;
 * `setup/servers.ts` is what actually spawns, waits for, and stops each
 * process.
 *
 * **L4 — a duplicate `<Stack.Screen name="account/new">` registration in
 * `apps/mobile/app/_layout.tsx` crashed Expo web on load**, which left tier
 * 2 unrunnable end to end. The whole-branch review that found it also ran
 * tier 2 live once against the patched layout — 10/10 specs passing — before
 * handing off the fix wave that carries the layout change itself.
 */

import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
  testDir: "specs",
  globalSetup: "./setup/global.ts",

  /**
   * One worker. Every spec after `00-smoke` writes through the same real
   * Expo web build against its own fresh browser context (Playwright's
   * default isolation), but they all still exercise one physical OPFS-backed
   * SQLite worker per origin on whatever `E2E_WEB_URL` names — parallel
   * workers would pile concurrent writes onto one worker thread for no
   * speedup, and `packages/ui/playwright.config.ts`'s own reason (the visual
   * suite's single worker) states the more general rule: this suite spends
   * its determinism budget on being right, not fast.
   */
  workers: 1,

  /** A spec that passes on retry did not pass — `packages/ui`'s own rule, restated. */
  retries: 0,

  reporter: [["list"]],

  use: {
    /**
     * Metro in development, Caddy in the appliance — `smoke.ts`'s own `WEB`
     * constant, restated for Playwright's `baseURL`.
     *
     * No fallback, deliberately: `support.ts` and `00-smoke.spec.ts` both
     * require this and every other base URL by name and throw if it is
     * unset, before any spec that would otherwise resolve a relative
     * `page.goto` against `undefined` — so an unset `E2E_WEB_URL` here is
     * never reached as a failure in its own right.
     *
     * Read at test time, not baked in at config-parse time: each worker is a
     * forked process that re-imports this file for itself, and forks happen
     * only after `globalSetup` (`setup/global.ts`) has already set
     * `E2E_WEB_URL` in this process's own environment — which `fork()`
     * copies into the worker's. By the time this line runs in a worker, the
     * web bundle it names is already answering.
     */
    baseURL: process.env["E2E_WEB_URL"],
    ...devices["Desktop Chrome"],
    /**
     * Below `tokens.ts`'s own `breakpoint.desk` (1024), deliberately.
     * `useBreakpoint()` (`packages/ui/src/primitives/use-breakpoint.ts`) reads
     * `useWindowDimensions()`, and `devices["Desktop Chrome"]`'s own viewport
     * sits above the threshold — the tab bar and `FloatingAdd` this suite's
     * specs drive (the same `getByRole("button", { name: "Add" })` tier 1
     * uses) exist only below it. Every scenario here is arc-phone's own, so
     * the phone layout is the one under test, not `DeskBand`'s.
     */
    viewport: { width: 390, height: 844 },
  },

  // No per-project `use` override: a project's `use` shallow-merges over the
  // top-level one, and respreading `devices["Desktop Chrome"]` here would
  // silently win back the desktop viewport this file just opted out of.
  projects: [{ name: "chromium" }],
});
