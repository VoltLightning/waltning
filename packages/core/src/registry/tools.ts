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

export function toolSchemas<Ctx>(registry: Registry<Ctx>): ToolSchema[] {
  return Object.values(registry)
    .map((op) => toolSchemaFor(op))
    .sort((a, b) => a.name.localeCompare(b.name));
}
