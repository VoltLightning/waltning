/**
 * Tier 2 — Playwright against the real Expo web build, on demand.
 *
 * `pnpm e2e` only. Nothing here runs from `pnpm verify` or any merge script
 * — see `src/smoke.ts`'s own header for why a check that depends on a
 * process someone remembered to start cannot be the gate.
 *
 * **No `webServer` block, deliberately.** `packages/ui/playwright.config.ts`
 * starts its own preview server because the thing under test — a Storybook
 * build — has no other reason to be running. Here the thing under test is
 * the whole stack: Expo web (`pnpm dev:web`) and the API
 * (`pnpm --filter @waltning/api dev`, pointed at `setup/database.ts`'s
 * scratch database — its own header has the exact command), both started by
 * a person, on purpose, before this file's `globalSetup` even runs. Wiring a
 * `webServer` here would make this look automated when the on-demand
 * contract is exactly that it is not.
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
  globalSetup: "./setup/database.ts",

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
    /** Metro in development, Caddy in the appliance — `smoke.ts`'s own `WEB` constant, restated for Playwright's `baseURL`. */
    baseURL: process.env["E2E_WEB_URL"] ?? "http://localhost:8081",
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
