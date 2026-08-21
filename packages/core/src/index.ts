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
// The branded amount type, importable without the namespace — it appears in
// every row type in  and in every component that renders one.
export type { Money, TxnType } from "./money.ts";
export * as money from "./money.ts";
export {
  type AuthenticationFailure,
  authenticateResponse,
  isTrpcEnvelope,
  NONCE_HEADER,
  type ResponseAuthentication,
  WALTNING_HEADER,
} from "./protocol.ts";
export {
  type ConflictGroups,
  type ConflictOutcome,
  conflictDecision,
  type FieldPatch,
  versionUnchanged,
} from "./registry/conflict.ts";
export {
  type AutoGrant,
  type GateDecision,
  type GateFields,
  gateDecision,
  type OperationIsGateable,
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
export {
  CaptiveResponseError,
  type FetchInit,
  type FetchLike,
  type RuleZeroOptions,
  ruleZeroFetch,
} from "./rule-zero-fetch.ts";
