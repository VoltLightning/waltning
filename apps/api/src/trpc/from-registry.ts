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

import type { AnyOperation, Operation, Registry } from "@waltning/core";
import type { z } from "zod";
import type { OperationContext } from "../registry/context.ts";
import type { Context } from "./index.ts";
import { publicProcedure, router } from "./index.ts";

/**
 * The procedure a single declaration becomes. Reads are queries and writes are
 * mutations, derived from `kind` rather than declared twice.
 */
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

function makeQuery<Input extends z.ZodTypeAny, Output>(
  op: Operation<Input, Output, OperationContext, "read">,
) {
  return publicProcedure
    .input(op.input)
    .query(({ input, ctx }) => op.invoke(input, operationContext(ctx)));
}

function makeMutation<Input extends z.ZodTypeAny, Output>(
  op: Operation<Input, Output, OperationContext, "write">,
) {
  return publicProcedure
    .input(op.input)
    .mutation(({ input, ctx }) => op.invoke(input, operationContext(ctx)));
}

/**
 * Derived from the builders above rather than from tRPC's procedure types,
 * which are not part of its public surface — the exported names are the erased
 * `Any*` ones. Asking the builder what it returns keeps this on supported
 * ground and cannot drift from what the loop below actually constructs.
 */
type ProcedureFor<Op> =
  Op extends Operation<infer Input, infer Output, OperationContext, "read">
    ? ReturnType<typeof makeQuery<Input, Output>>
    : Op extends Operation<infer Input, infer Output, OperationContext, "write">
      ? ReturnType<typeof makeMutation<Input, Output>>
      : never;

/**
 * The router type a whole registry becomes.
 *
 * This exists because the function returned `AnyRouter` — tRPC's erased type.
 * The router worked at run time and the client saw nothing:
 * `inferRouterOutputs<AppRouter>["op"]["get_currencies"]` accepted
 * `[{ code: "USD" }]`, a `CurrencySummary[]` missing every other field, and the
 * input accepted a string where a boolean was required. §11.0 promises types
 * survive to the client, and they did not.
 */
export type RouterFor<R> = { [K in keyof R]: ProcedureFor<R[K]> };

/**
 * The shape tRPC's `router()` accepts. Named rather than inlined as
 * `Record<string, unknown>`, which said nothing and forced a cast at the end.
 */
type ProcedureMap = Record<string, unknown>;

export function routerFromRegistry<R extends Registry<OperationContext>>(registry: R) {
  const procedures: ProcedureMap = {};

  for (const op of Object.values(registry) as AnyOperation<OperationContext>[]) {
    const base = publicProcedure.input(op.input);

    // A read is a query and a write is a mutation. Deriving this rather than
    // declaring it separately means the two can never disagree — and it is
    // the same flag the approval gate reads.
    procedures[op.name] =
      op.kind === "read"
        ? base.query(({ input, ctx }) => op.invoke(input, operationContext(ctx)))
        : base.mutation(({ input, ctx }) => op.invoke(input, operationContext(ctx)));
  }

  // The one cast, and it is the point of the file: the record is built by a
  // loop, which no inference can follow, so the *type* is computed from the
  // registry instead. Type-level tests assert the result matches each
  // declaration rather than taking this assertion's word for it.
  return router(procedures as RouterFor<R>);
}
