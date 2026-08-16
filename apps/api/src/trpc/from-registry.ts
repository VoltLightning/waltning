/**
 * Registry → tRPC router.
 *
 * The other half of §11.0. `toolSchemas()` in `@waltning/core` derives the
 * agent's tools from the same declarations; a contract test asserts the two
 * sets match and that a deliberate mismatch fails.
 *
 * **Routers are dumb** (`architecture/10`). Everything here is mechanical:
 * validate with the declared schema, dispatch, return. There is no place to
 * put an `if` about domain state, which is the point — logic added here is
 * logic the agent silently does not get, because it calls the registry
 * directly and never travels this path.
 */

import type { AnyRouter } from "@trpc/server";
import type { AnyOperation, Registry } from "@waltning/core";
import type { OperationContext } from "../registry/context.ts";
import type { Context } from "./index.ts";
import { publicProcedure, router } from "./index.ts";

/**
 * Handlers need a database; the HTTP context may not have one, because
 * `/healthz` must answer when Postgres is down. Failing here rather than
 * inside a handler keeps the "database unreachable" story in one place.
 */
function operationContext(ctx: Context): OperationContext {
  if (!ctx.db) {
    throw new Error("no database connection available for this operation");
  }
  return { db: ctx.db, actor: "user", requestId: ctx.requestId, now: ctx.now };
}

/**
 * The shape tRPC's `router()` accepts. Named rather than inlined as
 * `Record<string, unknown>`, which said nothing and forced a cast at the end.
 */
type ProcedureMap = Parameters<typeof router>[0];

export function routerFromRegistry(registry: Registry<OperationContext>): AnyRouter {
  const procedures: ProcedureMap = {};

  for (const op of Object.values(registry) as AnyOperation<OperationContext>[]) {
    const base = publicProcedure.input(op.input);

    // A read is a query and a write is a mutation. Deriving this rather than
    // declaring it separately means the two can never disagree — and it is
    // the same flag the approval gate reads.
    procedures[op.name] =
      op.kind === "read"
        ? base.query(({ input, ctx }) => op.handler(input, operationContext(ctx)))
        : base.mutation(({ input, ctx }) => op.handler(input, operationContext(ctx)));
  }

  return router(procedures);
}
