/**
 * The contract layer, and the bottom of the dependency graph.
 *
 * Everything here must run identically on the phone, the web bundle and the
 * server — so: no Node APIs, no database driver, no filesystem. decimal.js and
 * zod only. `packages/db` depends on this package; never the other way around.
 *
 * Grows with the registry: operation definitions, shared Zod schemas, F/R/S
 * classifications (`computations.md` §0).
 */
export type { JsonObject, JsonPrimitive, JsonSchema, JsonValue } from "./json.ts";
export * as money from "./money.ts";
export {
  type AutoGrant,
  type GateDecision,
  gateDecision,
  sensitiveFieldsWritten,
  TAX_SENSITIVE_FIELDS,
  type TaxSensitiveField,
} from "./registry/gate.ts";
export {
  type AnyOperation,
  type AuditSpec,
  defineOperation,
  type Operation,
  type OperationKind,
  type Registry,
} from "./registry/operation.ts";
export { type ToolSchema, toolSchemaFor, toolSchemas } from "./registry/tools.ts";
