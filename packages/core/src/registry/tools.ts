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
import type { Operation, Registry } from "./operation.ts";

/** The provider-neutral shape. Adapters map this to each SDK's own format. */
export type ToolSchema = {
  name: string;
  description: string;
  inputSchema: Record<string, unknown>;
  /**
   * Surfaced so the agent runtime can gate before calling rather than after.
   * A tool the model may run unattended is a different thing from one that
   * renders a diff and waits, and the model is not the right place to decide
   * which — but the runtime needs to know without a second lookup.
   */
  kind: Operation["kind"];
  autoEligible: boolean;
};

export function toolSchemaFor(op: Operation): ToolSchema {
  return {
    name: op.name,
    description: op.description,
    // JSON Schema, because that is what every provider's tool API speaks.
    inputSchema: z.toJSONSchema(op.input, { io: "input" }) as Record<string, unknown>,
    kind: op.kind,
    autoEligible: op.autoEligible,
  };
}

export function toolSchemas(registry: Registry): ToolSchema[] {
  return Object.values(registry)
    .map((op) => toolSchemaFor(op as Operation))
    .sort((a, b) => a.name.localeCompare(b.name));
}
