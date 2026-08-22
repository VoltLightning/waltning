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

// The branded amount type, importable without the namespace — it appears in
// every row type in  and in every component that renders one.
export { type AccountingDate, accountingDate, isAccountingDate, todayIn } from "./date.ts";
export { type Id, type IdTable, id } from "./id.ts";
export type { JsonObject, JsonPrimitive, JsonSchema, JsonValue } from "./json.ts";
export * as money from "./money.ts";
export {
  type CurrencyCode,
  currencyCode,
  type Money,
  type PivotPerUnit,
  type Rate,
  type TxnType,
  type UnitsPerPivot,
} from "./money.ts";
export {
  type AuthenticationFailure,
  authenticateResponse,
  isTrpcEnvelope,
  NONCE_HEADER,
  type ResponseAuthentication,
  WALTNING_HEADER,
} from "./protocol.ts";
export { canMintIds, type IdGenerator, randomId } from "./random.ts";
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
/**
 * The operation inputs, shared by the server's handler and the device's local
 * executor — §14.7's "two engines, one definition". A schema per side agrees
 * until one of them is edited.
 */
export {
  type AccountKind,
  type CreateAccountInput,
  type CreateTransactionInput,
  createAccountInput,
  createTransactionInput,
} from "./registry/inputs.ts";
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
/**
 * Zod schemas that produce branded values.
 *
 * The edge is the only place a brand can be established — inside the system a
 * value is branded because a column or a signature says so, and at a request
 * boundary there is only a string.
 */
export { zAccountingDate, zCurrencyCode, zId, zMoney, zPivotPerUnit } from "./zod.ts";
