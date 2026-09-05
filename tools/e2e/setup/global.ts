/**
 * Tier 2's `globalSetup` — the whole stack it needs, started here and
 * stopped here, once per `pnpm e2e` run.
 *
 * `playwright.config.ts` cannot use a `webServer` block: that starts before
 * `globalSetup`, and the API under test must be pointed at a database only
 * `database.ts`'s `createScratch()` creates — there is no `APP_DATABASE_URL`
 * to hand a `webServer` until the clone exists. So this file owns the whole
 * lifecycle itself, in the one order that works: the database, then the API
 * (which needs it), then the web bundle (which needs neither — arc-phone is
 * local-first, and the browser bootstraps its own reference currencies).
 *
 * The two URLs this sets — `E2E_API_URL`, `E2E_WEB_URL` — are read by
 * `playwright.config.ts`'s `baseURL` and every spec that names an API
 * directly (`00-smoke.spec.ts`, `smoke.ts`'s own defaults). Each worker
 * Playwright forks re-imports `playwright.config.ts` and every spec file
 * fresh, in its own process, and that process only exists *after* this
 * function returns — so the env this sets here is what the fork inherits.
 *
 * **`make appliance-e2e` is the one case this does not start anything for.**
 * That target already names both URLs — the appliance's own — before `pnpm
 * e2e` runs, exactly so the suite can be pointed at a live deployment instead
 * of a fresh local stack. Starting a local API and web bundle anyway would
 * silently test the wrong thing while still reporting green.
 *
 * **A `globalSetup` that throws gets no teardown.** Playwright's own
 * `teardown` for this file closes over whatever this function returns —
 * nothing, if it never reaches its `return` — so a failure partway through
 * (the API up, the web bundle refusing to start) would otherwise leak
 * exactly the resources already created. Each step below is unwound by hand
 * on the way out instead of relying on the return value to do it.
 */

import { createScratch } from "./database.ts";
import { startApi, startWeb } from "./servers.ts";

/** Never 3000 — a developer's own API may already hold that port, against the real ledger. */
const DEFAULT_API_PORT = 3300;

/** Expo's own default for `expo start --web`; not configurable here because `startWeb`'s reuse check depends on knowing exactly where to look. */
const WEB_PORT = 8081;

export default async function globalSetup(): Promise<() => Promise<void>> {
  const apiUrlOverride = process.env["E2E_API_URL"];
  const webUrlOverride = process.env["E2E_WEB_URL"];
  if (apiUrlOverride && webUrlOverride) {
    return async () => {};
  }

  const scratch = await createScratch();

  try {
    const apiPort = Number(process.env["E2E_API_PORT"] ?? DEFAULT_API_PORT);
    const api = await startApi({ appDatabaseUrl: scratch.appUrl, port: apiPort });

    try {
      const web = await startWeb({ port: WEB_PORT });

      process.env["E2E_API_URL"] = api.url;
      process.env["E2E_WEB_URL"] = web.url;

      return async () => {
        try {
          await web.stop();
        } finally {
          try {
            await api.stop();
          } finally {
            await scratch.drop();
          }
        }
      };
    } catch (error) {
      // `error`'s type is `unknown` — a catch binding is one of the few
      // places this repo allows it, since the language gives no choice.
      await api.stop();
      throw error;
    }
  } catch (error) {
    // Same reason as above: a catch binding, typed `unknown` by the language.
    await scratch.drop();
    throw error;
  }
}
