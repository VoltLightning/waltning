/**
 * The probe contract (`architecture/09` §probes).
 *
 * Two endpoints, and the split is the point: three connectivity states are
 * unreachable without it.
 *
 *   /healthz  unauthenticated, touches nothing.  reachable vs not
 *   /readyz   authenticated, touches Postgres.   degraded vs online
 *
 * `/healthz` must not touch Postgres. If it did, a database outage would look
 * like an unreachable server, and the client would go `offline` and stop
 * draining rather than `degraded` and pause — different behaviour, and the
 * wrong one loses the distinction the whole state machine is built on.
 */

import { BUILD } from "./build.ts";

export type Health = {
  ok: true;
  build: string;
  serverTime: string;
};

export function health(now: Date): Health {
  return { ok: true, build: BUILD, serverTime: now.toISOString() };
}

export type DependencyState = "up" | "down";

export type Readiness = {
  ok: boolean;
  build: string;
  serverTime: string;
  db: DependencyState;
  blobs: DependencyState;
  /** Present only when something is down. Never a connection string. */
  reason?: string;
};

/**
 * `ok` follows **Postgres alone**. MinIO being down is reported and does not
 * fail readiness: `01-context-and-containers.md` promises per-dependency
 * degradation, and without receipts the ledger is fully functional — refusing
 * traffic for it would turn a degradation into an outage.
 */
export function readiness(
  now: Date,
  db: DependencyState,
  blobs: DependencyState,
  reason?: string,
): Readiness {
  const base: Readiness = {
    ok: db === "up",
    build: BUILD,
    serverTime: now.toISOString(),
    db,
    blobs,
  };
  return reason && db === "down" ? { ...base, reason } : base;
}
