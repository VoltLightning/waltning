/**
 * The HTTP surface: probes and tRPC, and nothing else.
 *
 * Exported as a factory so tests get an app without a listening socket.
 */

import { fetchRequestHandler } from "@trpc/server/adapters/fetch";
import { ping } from "@waltning/db";
import { Hono } from "hono";
import { db, dbUnavailableReason } from "../infra/db.ts";
import { waltningHeader } from "../middleware/waltning-header.ts";
import type { Context } from "../trpc/index.ts";
import { appRouter } from "../trpc/router.ts";
import { type DependencyState, health, readiness } from "./health.ts";

export type AppOptions = {
  /** Injected so tests can drive time and dependency state. */
  now?: () => Date;
  blobs?: () => DependencyState;
  requestId?: () => string;
};

let counter = 0;

export function createApp(options: AppOptions = {}) {
  const now = options.now ?? (() => new Date());
  const blobs = options.blobs ?? (() => "up" as const);
  const requestId = options.requestId ?? (() => `r${++counter}`);

  const app = new Hono();

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

    const state = readiness(now(), up ? "up" : "down", blobs(), reason);
    return c.json(state, state.ok ? 200 : 503);
  });

  app.all("/trpc/*", (c) =>
    fetchRequestHandler({
      endpoint: "/trpc",
      req: c.req.raw,
      router: appRouter,
      createContext: (): Context => ({ db: db(), requestId: requestId(), now: now() }),
    }),
  );

  return app;
}
