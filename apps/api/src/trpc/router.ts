/**
 * The root router.
 *
 * Stays almost empty on purpose: every write in this system is a **registry
 * operation**, and procedures dispatch to the registry rather than holding
 * logic (the architecture rule — routers are dumb). What lives here is the
 * mount point and the one procedure a client needs before it has a session.
 */

import { BUILD } from "../config/build.ts";
import { registry } from "../registry/index.ts";
import { routerFromRegistry } from "./from-registry.ts";
import { publicProcedure, router } from "./index.ts";

/**
 * Every operation, mounted under `op.*`, derived rather than listed.
 *
 * Adding an operation to the registry adds it here and to the agent's tools at
 * the same instant; there is no second place to forget.
 */
export const appRouter = router({
  op: routerFromRegistry(registry),
  /**
   * The tRPC-shaped twin of `/healthz`.
   *
   * Rule 0 requires a body that parses as the tRPC envelope, so the client
   * needs at least one procedure it can call unauthenticated to prove the
   * transport is ours and not a portal's.
   */
  ping: publicProcedure.query(({ ctx }) => ({
    ok: true as const,
    build: BUILD,
    serverTime: ctx.now.toISOString(),
    requestId: ctx.requestId,
  })),
});

export type AppRouter = typeof appRouter;
