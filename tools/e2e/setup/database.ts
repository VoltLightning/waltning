/**
 * Tier 2's own database: a throwaway Postgres clone, one per `pnpm e2e` run.
 *
 * `createScratch()` is what `global.ts`'s `globalSetup` calls first, before
 * either process it starts: the API under test needs a real
 * `APP_DATABASE_URL` at the moment it is spawned, and this is the one thing
 * that can hand it one. It reuses `@waltning/db/test/scratch`
 * (`packages/db/src/test/scratch.ts`) rather than reimplementing "clone a
 * migrated database": `createTemplate()` builds the once-per-checkout
 * template `pnpm db:*` and the unit suite already share, and
 * `scratchDatabase()` clones a fresh, uniquely-named database from it — the
 * same guarantee `pnpm verify`'s own DB tests rest on, applied here to a
 * server nothing else is running against.
 *
 * **This does not drop the template.** `dropTemplate()` exists for vitest's
 * own `globalSetup`/`globalTeardown` pair, which owns that database's whole
 * lifecycle for a `pnpm test` run. Tearing it down here too would race a
 * concurrent `pnpm test` in the same checkout — an on-demand tier has no
 * business ending a database another, unrelated run still owns. Only the
 * scratch clone `createScratch()` made, via the `drop()` it returns, is ever
 * dropped — `global.ts`'s own teardown calls it last, after both processes it
 * started have stopped.
 */

import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { createTemplate, scratchDatabase } from "@waltning/db/test/scratch";

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

export type Scratch = {
  /** The app role's own URL, pointed at the scratch clone — what `startApi` hands the API under test as `APP_DATABASE_URL`. */
  appUrl: string;
  drop: () => Promise<void>;
};

/**
 * Drops and rebuilds the template unconditionally — `createTemplate()`
 * (`scratch.ts`) does not check whether one already exists first, so
 * `pnpm test` running in this *same checkout* at the same moment would have
 * its own template dropped out from under it mid-run. Cross-worktree is
 * safe, not by accident but by name: `TEMPLATE_DB` is a hash of
 * `scratch.ts`'s own *absolute path* (`scratch.ts`'s own doc), which differs
 * between checkouts sharing one Postgres, so two worktrees' templates never
 * collide — only two runs in the one checkout can race.
 *
 * Then clones a fresh scratch database from the template and seeds it — the
 * reference currencies `00-smoke.spec.ts`'s `read()` check and every journey
 * after it depend on.
 */
export async function createScratch(): Promise<Scratch> {
  await createTemplate();
  const scratch = await scratchDatabase("e2e");
  const appUrl = withDatabase(requireAppDatabaseUrl(), scratch.name);
  seed(appUrl);

  // Read by nothing in this process automatically — available to a spec that
  // wants it (none do today; every spec after `00-smoke` drives the real Expo
  // web build instead, never Postgres directly).
  process.env["E2E_APP_DATABASE_URL"] = appUrl;

  return { appUrl, drop: scratch.drop };
}
