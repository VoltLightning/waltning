/**
 * Registry → agent tool schemas.
 *
 * One half of §11.0's claim. The other half is the tRPC router
 * (`apps/api/src/trpc/from-registry.ts`); a contract test asserts both derive
 * the same set, and that a deliberate mismatch fails.
 *
 * Deriving rather than hand-writing is the whole point: a hand-maintained tool
 * list drifts from the router the first time someone adds a screen action and
 * forgets, and the drift is invisible until the agent is asked to do something
 * the UI can already do.
 */

import { z } from "zod";
import type { JsonSchema } from "../json.ts";
import type { AnyOperation, OperationKind, Registry } from "./operation.ts";

/** The provider-neutral shape. Adapters map this to each SDK's own format. */
export type ToolSchema = {
  name: string;
  description: string;
  inputSchema: JsonSchema;
  /**
   * Surfaced so the agent runtime can gate before calling rather than after.
   * A tool the model may run unattended is a different thing from one that
   * renders a diff and waits, and the model is not the right place to decide
   * which — but the runtime needs to know without a second lookup.
   */
  kind: OperationKind;
  autoEligible: boolean;
};

export function toolSchemaFor<Ctx>(op: AnyOperation<Ctx>): ToolSchema {
  return {
    name: op.name,
    description: op.description,
    // JSON Schema, because that is what every provider's tool API speaks.
    inputSchema: z.toJSONSchema(op.input, { io: "input" }) as JsonSchema,
    kind: op.kind,
    autoEligible: op.autoEligible,
  };
}

/**
 * Every operation the agent may call — §11.0's `agentVisible`, which was
 * declared in `operations.md` and honoured nowhere.
 *
 * **Absent means visible.** A new operation is a tool unless its author says
 * otherwise; the filter exists for the three S33 operations that configure
 * the agent itself, and an agent that can swap its own model or widen its own
 * permissions is not a capability anybody asked for.
 *
 * The router derives from the same registry and **does not** apply this: a
 * person configuring the agent through the app is exactly who those
 * operations are for. `from-registry.ts` says the same thing from its side.
 */
export function toolSchemas<Ctx>(registry: Registry<Ctx>): ToolSchema[] {
  return Object.values(registry)
    .filter((op) => op.agentVisible !== false)
    .map((op) => toolSchemaFor(op))
    .sort((a, b) => a.name.localeCompare(b.name));
}
