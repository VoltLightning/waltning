/**
 * Tier 2's own database: a throwaway Postgres clone, one per `pnpm e2e` run.
 *
 * Playwright's `globalSetup` (`playwright.config.ts`) runs this once, before
 * any spec, in the same Node process that then runs every test — and the
 * teardown this file returns runs once, after the last one. It reuses
 * `@waltning/db/test/scratch` (`packages/db/src/test/scratch.ts`) rather than
 * reimplementing "clone a migrated database": `createTemplate()` builds the
 * once-per-checkout template `pnpm db:*` and the unit suite already share,
 * and `scratchDatabase()` clones a fresh, uniquely-named database from it —
 * the same guarantee `pnpm verify`'s own DB tests rest on, applied here to a
 * server nothing else is running against.
 *
 * **This does not drop the template.** `dropTemplate()` exists for vitest's
 * own `globalSetup`/`globalTeardown` pair, which owns that database's whole
 * lifecycle for a `pnpm test` run. Tearing it down here too would race a
 * concurrent `pnpm test` in the same checkout — an on-demand tier has no
 * business ending a database another, unrelated run still owns. Only the
 * scratch clone this run made is ever dropped.
 *
 * **The two-process problem, and why this waits for a person.** The API
 * under test is started separately — `playwright.config.ts`'s whole
 * `webServer`-free contract — so it cannot already be pointed at a database
 * this process has not created yet, and every scratch database is
 * uniquely named (`scratch.ts`'s own `pid` + counter), so a URL printed by a
 * *previous* `pnpm e2e` is already gone: that run's own teardown dropped it
 * on exit. Printing the URL and moving straight on would race the person
 * reading it, so this instead blocks on a keypress — the scratch database
 * stays alive, and the API can be (re)started against the exact one this
 * run made, in the one window where both are true at once:
 *
 *   1. `pnpm e2e` — this prints the scratch database's `APP_DATABASE_URL`
 *      and waits.
 *   2. In another terminal:
 *
 *        APP_DATABASE_URL=<printed> pnpm --filter @waltning/api dev
 *
 *      and `pnpm dev:web`, if it is not already running.
 *   3. Press Enter. `00-smoke.spec.ts` runs first; every spec after it never
 *      touches Postgres directly — they drive the real Expo web build
 *      through `getByRole`, exactly as `apps/mobile/src/journeys/journey-
 *      harness.tsx`'s tier-1 journeys do, because arc-phone's ledger is
 *      local-first: the browser bootstraps its own reference currencies
 *      (`phone-ledger.web.ts`) and never asks the server for them. The
 *      scratch database exists so the API is real and reachable — the same
 *      thing `00-smoke.spec.ts` and, eventually, an outbox drain both need —
 *      not because a spec queries it.
 *
 * **Without a terminal attached** (no TTY — a script, a redirected run),
 * waiting for a keypress that can never come would hang forever, so this
 * logs the same instructions once and continues immediately instead. That
 * run is on the caller to have sequenced correctly ahead of time.
 */

import { execFileSync } from "node:child_process";
import { createInterface } from "node:readline/promises";
import { fileURLToPath } from "node:url";
import { createTemplate, scratchDatabase } from "@waltning/db/test/scratch";

const DIVIDER = "─".repeat(72);

/** `tools/e2e/setup/` → the repo root — `pnpm --filter` resolves from here regardless of cwd, but this keeps the call explicit. */
const repoRoot = fileURLToPath(new URL("../../..", import.meta.url));

/**
 * The template `createTemplate()` clones from is migrated, not seeded
 * (`scratch.ts`'s own doc: "an empty database with all migrations
 * applied") — every unit DB test seeds its own fixtures instead. Tier 2 has
 * no such per-test fixture step, and `00-smoke.spec.ts`'s `read()` check
 * (ported from `smoke.ts`) exists specifically to prove the reference
 * currencies are there — reusing `@waltning/db`'s own seed script, pointed
 * at the scratch clone, is what makes that check possible instead of an
 * unconditional failure on every run.
 */
function seed(appUrl: string): void {
  execFileSync("pnpm", ["--filter", "@waltning/db", "seed"], {
    cwd: repoRoot,
    env: { ...process.env, APP_DATABASE_URL: appUrl },
    stdio: "inherit",
  });
}

function requireAppDatabaseUrl(): string {
  const url = process.env["APP_DATABASE_URL"];
  if (!url) {
    throw new Error(
      "APP_DATABASE_URL is not set. Copy .env.example to .env and fill it in — " +
        "tier 2 hands the API under test the app role's own credentials, " +
        "pointed at a scratch database this file just cloned.",
    );
  }
  return url;
}

/** Same server, same role, a different database — `scratch.ts`'s own `urlFor`, not exported, restated here. */
function withDatabase(url: string, database: string): string {
  const target = new URL(url);
  target.pathname = `/${database}`;
  return target.toString();
}

async function waitForOperator(startCommand: string): Promise<void> {
  console.log(`\n${DIVIDER}`);
  console.log("  Point the API under test at this scratch database:\n");
  console.log(`    ${startCommand}\n`);
  console.log("  ...and pnpm dev:web, if it is not already running.");

  if (!process.stdin.isTTY) {
    console.log("  No terminal attached — continuing immediately. Sequence this by hand:");
    console.log(DIVIDER);
    return;
  }

  const rl = createInterface({ input: process.stdin, output: process.stdout });
  try {
    await rl.question("\n  Press Enter once both are running… ");
  } finally {
    rl.close();
  }
  console.log(DIVIDER);
}

export default async function globalSetup(): Promise<() => Promise<void>> {
  await createTemplate();
  const scratch = await scratchDatabase("e2e");
  const appUrl = withDatabase(requireAppDatabaseUrl(), scratch.name);
  seed(appUrl);

  // Read by nothing in this process automatically — printed for the human,
  // and available to a spec that wants it (none do today; see the header).
  process.env["E2E_APP_DATABASE_URL"] = appUrl;

  await waitForOperator(`APP_DATABASE_URL=${appUrl} pnpm --filter @waltning/api dev`);

  return async () => {
    await scratch.drop();
  };
}
