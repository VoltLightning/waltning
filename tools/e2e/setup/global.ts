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
 * local-first, and the browser bootstraps its own reference currencies, in
 * its own OPFS origin that never talks to this run's API — `servers.ts`'s
 * own header on `startWeb`).
 *
 * The two URLs this sets — `E2E_API_URL`, `E2E_WEB_URL` — are read by
 * `playwright.config.ts`'s `baseURL` and every spec that names an API
 * directly (`00-smoke.spec.ts`). Each worker Playwright forks re-imports
 * `playwright.config.ts` and every spec file fresh, in its own process, and
 * that process only exists *after* this function returns — so the env this
 * sets here is what the fork inherits.
 *
 * **`make appliance-e2e` is the one case this does not start anything for.**
 * That target already names both URLs — the appliance's own — before `pnpm
 * e2e` runs, exactly so the suite can be pointed at a live deployment instead
 * of a fresh local stack. Starting a local API and web bundle anyway would
 * silently test the wrong thing while still reporting green. Naming only one
 * of the two is never a state this run can make sense of — see the check
 * below.
 *
 * **A `globalSetup` that throws gets no teardown.** Playwright's own
 * `teardown` for this file closes over whatever this function returns —
 * nothing, if it never reaches its `return` — so a failure partway through
 * (the API up, the web bundle refusing to start) would otherwise leak
 * exactly the resources already created. `cleanups` tracks what has actually
 * started, in order, and `unwind()` runs it in reverse — on a thrown error,
 * on `SIGINT` mid-setup, and, once setup succeeds, as the teardown Playwright
 * itself calls after the last test.
 */

import { createScratch } from "./database.ts";
import { readPort, startApi, startWeb } from "./servers.ts";

/** Never 3000 — a developer's own API may already hold that port, against the real ledger. Only where probing starts; the API can land on a later port if this one is taken. */
const DEFAULT_API_PORT = 3300;

/** Never 8081 — a developer's own Metro may already hold that port, and sharing it would share its OPFS ledger too (`servers.ts`'s own `startWeb`). Only where probing starts. */
const DEFAULT_WEB_PORT = 8082;

export default async function globalSetup(): Promise<() => Promise<void>> {
  const apiUrlOverride = process.env["E2E_API_URL"];
  const webUrlOverride = process.env["E2E_WEB_URL"];

  if (apiUrlOverride !== undefined && webUrlOverride !== undefined) {
    return async () => {};
  }
  if (apiUrlOverride !== undefined || webUrlOverride !== undefined) {
    throw new Error(
      "E2E_API_URL and E2E_WEB_URL must be set together, for appliance mode " +
        "(`make appliance-e2e`) or not at all. Only one is set here — " +
        `E2E_API_URL=${JSON.stringify(apiUrlOverride)}, E2E_WEB_URL=${JSON.stringify(webUrlOverride)} — ` +
        "and the other would silently fall back to this run's own local stack.",
    );
  }

  const cleanups: Array<() => Promise<void>> = [];

  /** Reverse order, one failure isolated from the rest — a drop that throws must never skip stopping a process, or the reverse. */
  async function unwind(): Promise<void> {
    for (const cleanup of cleanups.slice().reverse()) {
      try {
        await cleanup();
      } catch {
        // Best-effort: the caller is already unwinding because something
        // failed (or the process is exiting on SIGINT) — a second error here
        // would only bury the first, or the exit, without helping either.
      }
    }
  }

  /**
   * `SIGINT` mid-setup (a person's own Ctrl-C while a slow Metro bundle is
   * still starting) would otherwise leave a database clone or a spawned API
   * running past the keypress that was meant to stop them.
   *
   * `prependOnceListener`, not `once` — Playwright's own runner already has a
   * `SIGINT` listener active by the time `globalSetup` runs (its
   * `SigIntWatcher`), and prepending gives this handler first refusal on the
   * signal rather than whatever position `on`/`once` would append it at.
   *
   * **This is a best-effort race, not a guarantee, and parts of it can still
   * lose — verified empirically, three ways:**
   *
   * - A child process **already in `cleanups`** dies reliably: `stopper()`'s
   *   `SIGTERM` is sent synchronously, inside the `Promise` executor, the
   *   instant `unwind()` reaches that cleanup — the signal is on its way to
   *   the OS before anything else in this process runs again, whether or not
   *   this process survives to see the "exit" event confirm it.
   * - A child process **spawned but not yet in `cleanups`** — `startApi`/
   *   `startWeb` still awaiting their own readiness check when the signal
   *   arrives — is not touched at all: it was never reached. This is the
   *   "whatever exists so far" this handler was scoped to from the start.
   * - The scratch database, even when it **is** in `cleanups`, can still be
   *   lost: `scratch.drop()` needs a real Postgres round trip, and
   *   Playwright's own `SigIntWatcher` resolves its side of a `Promise.race`
   *   the instant the signal arrives and can reach its own `process.exit()`
   *   — synchronous, in-memory work all the way down — before that round
   *   trip returns, even with this handler's head start.
   *
   * Net effect: a `Ctrl-C` during setup can leave a `waltning_test_e2e_*`
   * database behind (harmless — the next `pnpm e2e` clones its own, uniquely
   * named, and never touches an old one) and, less often, a spawned process
   * still listening on its port (loud, not silent — the next `pnpm e2e`
   * finds a later port instead, per `findFreePort`, rather than passing
   * against the wrong server). Removed once setup itself is done (success or
   * failure) — from then on Playwright's own signal handling, once tests are
   * running, owns this.
   */
  const onSigint = (): void => {
    void unwind().then(() => process.exit(130));
  };
  process.prependOnceListener("SIGINT", onSigint);

  try {
    const scratch = await createScratch();
    cleanups.push(scratch.drop);

    const apiFrom = readPort("E2E_API_PORT", process.env["E2E_API_PORT"], DEFAULT_API_PORT);
    const api = await startApi({ appDatabaseUrl: scratch.appUrl, from: apiFrom });
    cleanups.push(api.stop);

    const webFrom = readPort("E2E_WEB_PORT", process.env["E2E_WEB_PORT"], DEFAULT_WEB_PORT);
    const web = await startWeb({ from: webFrom });
    cleanups.push(web.stop);

    process.env["E2E_API_URL"] = api.url;
    process.env["E2E_WEB_URL"] = web.url;

    return async () => {
      await unwind();
    };
  } catch (error) {
    // `error`'s type is `unknown` — a catch binding is one of the few places
    // this repo allows it, since the language gives no choice.
    await unwind();
    throw error;
  } finally {
    process.off("SIGINT", onSigint);
  }
}
