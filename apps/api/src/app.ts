/**
 * The HTTP surface: probes and tRPC, and nothing else.
 *
 * Exported as a factory so tests get an app without a listening socket.
 */

import { fetchRequestHandler } from "@trpc/server/adapters/fetch";
import { ping } from "@waltning/db";
import { Hono } from "hono";
import { BUILD, WALTNING_HEADER } from "./build.ts";
import { db, dbUnavailableReason } from "./db.ts";
import { type DependencyState, health, readiness } from "./health.ts";
import { appRouter } from "./router.ts";
import type { Context } from "./trpc.ts";

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

  /**
   * Rule 0's first condition, on every response including errors.
   *
   * A captive portal answers 200 with HTML to anything. The client must be
   * able to reject that before it looks at the status code, and this header is
   * the cheapest of the three signals it checks.
   */
  app.use("*", async (c, next) => {
    await next();
    // **After** the handler, not before. The tRPC adapter returns a Response it
    // constructed itself, which replaces anything set on the way in — so
    // setting the header first left it missing on exactly the responses the
    // outbox drain inspects. Rule 0 fails open in the worst possible place if
    // this regresses, which is why there is a test per route.
    c.header(WALTNING_HEADER, BUILD);
  });

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
