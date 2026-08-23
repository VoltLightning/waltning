/**
 * The application's database handle.
 *
 * **`createDb()` is called with its URL explicitly** (§5.7). The default
 * argument resolves `APP_DATABASE_URL` on its own, and a call site that relies
 * on that is one edit away from silently taking whatever connection is
 * configured — including a superuser, which bypasses every `GRANT` and makes
 * T1 unenforceable while every query still succeeds.
 *
 * Resolved **lazily**, not at boot. `/healthz` must answer without touching
 * Postgres (`architecture/09`): if the process refused to start without a
 * database, a database outage would present as an unreachable server, and the
 * client would go `offline` and stop draining instead of `degraded` and pause.
 * Those are different behaviours and only one of them is correct.
 */

import { createDb, type Database } from "@waltning/db/client";

let handle: Database | null = null;
let lastError: string | null = null;

export function appDatabaseUrl(): string | null {
  return process.env["APP_DATABASE_URL"] ?? null;
}

/** The handle, or `null` with the reason recorded for `/readyz` to report. */
export function db(): Database | null {
  if (handle) return handle;

  const url = appDatabaseUrl();
  if (!url) {
    lastError = "APP_DATABASE_URL is not set";
    return null;
  }

  try {
    handle = createDb(url);
    lastError = null;
    return handle;
  } catch (e) {
    lastError = e instanceof Error ? e.message : String(e);
    return null;
  }
}

export function dbUnavailableReason(): string | null {
  return lastError;
}
