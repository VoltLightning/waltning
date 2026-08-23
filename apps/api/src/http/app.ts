/**
 * The HTTP surface: probes and tRPC, and nothing else.
 *
 * Exported as a factory so tests get an app without a listening socket.
 */

import { fetchRequestHandler } from "@trpc/server/adapters/fetch";
import { REQUEST_ID_HEADER } from "@waltning/core/protocol";
import { ping } from "@waltning/db/client";
import { Hono } from "hono";
import {
  type ApiDiagnostics,
  describeApiError,
  diagnosticDuration,
  emitApiDiagnostic,
} from "../common/diagnostics.ts";
import { apiDiagnostics } from "../common/logger.ts";
import { pingBlobs } from "../infra/blobs.ts";
import { db, dbUnavailableReason } from "../infra/db.ts";
import { waltningHeader } from "../middleware/waltning-header.ts";
import type { Context } from "../trpc/index.ts";
import { appRouter } from "../trpc/router.ts";
import { devCors } from "./dev-cors.ts";
import { type DependencyState, health, readiness } from "./health.ts";

export type AppOptions = {
  /** Injected so tests can drive time and dependency state. */
  now?: () => Date;
  blobs?: () => Promise<DependencyState | undefined>;
  requestId?: () => string;
  diagnostics?: ApiDiagnostics;
  /**
   * Local-development cross-origin allowance (`dev-cors.ts`). Read from the
   * environment by default, and **absent means no CORS at all** — production
   * is same-origin behind Caddy and has nothing to allow.
   */
  devCorsOrigin?: string | undefined;
};

let counter = 0;

export function createApp(options: AppOptions = {}) {
  const now = options.now ?? (() => new Date());
  // Defaults to the real check, which returns `undefined` when no blob store
  // is configured — so the field is measured or absent, never asserted.
  const blobs = options.blobs ?? pingBlobs;
  const requestId = options.requestId ?? (() => `r${++counter}`);
  const diagnostics = options.diagnostics ?? apiDiagnostics;

  const app = new Hono<{ Variables: { requestId: string } }>();

  app.use("*", async (c, next) => {
    const incoming = c.req.header(REQUEST_ID_HEADER);
    const correlationId = incoming && isSafeRequestId(incoming) ? incoming : requestId();
    const identity = {
      requestId: correlationId,
      method: c.req.method,
      path: c.req.path,
    } as const;
    const startedAt = now().getTime();
    c.set("requestId", correlationId);
    c.header(REQUEST_ID_HEADER, correlationId);
    emitApiDiagnostic(diagnostics, { scope: "http_request", phase: "start", ...identity });

    try {
      await next();
      emitApiDiagnostic(diagnostics, {
        scope: "http_request",
        phase: "response",
        ...identity,
        status: c.res.status,
        durationMs: diagnosticDuration(startedAt, now().getTime()),
      });
    } catch (error) {
      emitApiDiagnostic(diagnostics, {
        scope: "http_request",
        phase: "failure",
        ...identity,
        durationMs: diagnosticDuration(startedAt, now().getTime()),
        error: describeApiError(error),
      });
      throw error;
    }
  });

  // Before everything, so a preflight is answered rather than falling through
  // to a route that does not exist. Mounted only when configured — see
  // `dev-cors.ts` for why this is opt-in rather than a default to override.
  const corsMiddleware = devCors(
    "devCorsOrigin" in options ? options.devCorsOrigin : process.env["DEV_CORS_ORIGIN"],
  );
  if (corsMiddleware) app.use("*", corsMiddleware);

  app.use("*", waltningHeader);

  /** Unauthenticated, touches nothing. Reachable vs not. */
  app.get("/healthz", (c) => c.json(health(now())));

  /**
   * Touches Postgres. Degraded vs online.
   *
   * Authentication arrives with the session card; until then this is open, and
   * it deliberately reports **only** dependency states — never a connection
   * string, never an error body from the driver.
   */
  app.get("/readyz", async (c) => {
    const handle = db();
    const up = handle ? await ping(handle) : false;
    const reason = handle ? "database unreachable" : (dbUnavailableReason() ?? "unavailable");

    const state = readiness(now(), up ? "up" : "down", await blobs(), reason);
    return c.json(state, state.ok ? 200 : 503);
  });

  app.all("/trpc/*", (c) =>
    fetchRequestHandler({
      endpoint: "/trpc",
      req: c.req.raw,
      router: appRouter,
      createContext: (): Context => ({
        db: db(),
        requestId: c.get("requestId"),
        now: now(),
        diagnostics,
      }),
    }),
  );

  return app;
}

function isSafeRequestId(value: string): boolean {
  return /^[A-Za-z0-9._:-]{1,100}$/u.test(value);
}
