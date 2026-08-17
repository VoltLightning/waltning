/**
 * The blob store's reachability, and nothing else.
 *
 * `/readyz` used to report `blobs: "up"` from a constant, because there was no
 * blob store to ask — MinIO existed in `.env.example` and in no container and
 * no code. The field was then removed rather than left lying: a constant
 * dressed as a measurement is worse than no measurement, since only one of the
 * two can be trusted at a glance.
 *
 * This is what brings it back honestly. It is deliberately **not** an S3
 * client: nothing reads or writes objects yet, and a client with no caller
 * would be the same shape of pretend. All it answers is "is the thing there",
 * which is exactly what a readiness probe is entitled to claim.
 *
 * Configured by presence: no `MINIO_ENDPOINT`, no measurement, and `/readyz`
 * omits the field. That keeps a development stack without MinIO honest instead
 * of permanently degraded.
 */

import type { DependencyState } from "../http/health.ts";

/**
 * MinIO's own liveness endpoint. Unauthenticated by design, so this needs no
 * credentials — which matters: a probe that had to authenticate would report
 * "down" for a wrong password, and a wrong password is not an outage.
 */
const LIVENESS_PATH = "/minio/health/live";

/**
 * A probe must answer faster than the thing asking is willing to wait. Without
 * a bound, a blob store that accepts connections and never replies turns
 * `/readyz` from a health check into another hung request — and the caller
 * concludes the *API* is down.
 */
const TIMEOUT_MS = 2_000;

export function blobsEndpoint(): string | null {
  return process.env["MINIO_ENDPOINT"] ?? null;
}

/**
 * @returns `undefined` when nothing is configured — meaning "not measured",
 * which is a different statement from "down" and must not be rendered as one.
 */
export async function pingBlobs(): Promise<DependencyState | undefined> {
  const endpoint = blobsEndpoint();
  if (!endpoint) return undefined;

  try {
    const res = await fetch(new URL(LIVENESS_PATH, endpoint), {
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
    return res.ok ? "up" : "down";
  } catch {
    // Connection refused, DNS failure, timeout — all the same answer to the
    // only question being asked. The reason belongs in a log, not in a probe
    // response that a browser can read.
    return "down";
  }
}
