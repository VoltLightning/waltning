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

import { BUILD } from "../config/build.ts";

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
  /**
   * **Absent until something actually checks it.**
   *
   * This field was `DependencyState` and was filled from a default that
   * returned `"up"` — there is no blob-store client anywhere in the system, so
   * the probe reported a dependency it had never contacted. MinIO off, receipt
   * capture broken, and `/readyz` answering `{"ok":true,"blobs":"up"}`.
   *
   * A constant dressed as a measurement is worse than no measurement, because
   * only one of the two can be trusted at a glance. It comes back when a
   * checker exists.
   */
  blobs?: DependencyState;
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
  blobs: DependencyState | undefined,
  reason?: string,
): Readiness {
  const base: Readiness = {
    ok: db === "up",
    build: BUILD,
    serverTime: now.toISOString(),
    db,
    // Reported only when measured. `undefined` here means "nothing checks this
    // yet", which is a different statement from "it is down" and must not be
    // rendered as either.
    ...(blobs === undefined ? {} : { blobs }),
  };
  return reason && db === "down" ? { ...base, reason } : base;
}
