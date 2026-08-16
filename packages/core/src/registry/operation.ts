/**
 * The operation registry's declaration type.
 *
 * §11.0's claim, which nothing had ever tested: the agent is not a separate
 * surface with a hand-written tool list. Every capability is one named, typed,
 * validated, audited declaration, and **both** the tRPC router and the agent's
 * tools are derived from it. The consequence worth stating plainly is that
 * there is no operation the UI can perform that the agent cannot, and the two
 * cannot drift, because they are the same declaration read twice.
 *
 * This type lives in `core` rather than `apps/api` because the *shape* is a
 * contract both sides depend on — the phone needs `offlineEligible` and
 * `opVersion` to decide what may enter an outbox, and it must never import the
 * server. Handlers live with the implementations in `apps/api/src/registry`,
 * where they can reach services.
 */

import type { z } from "zod";

/**
 * What a write touches, for the audit row the registry writes on the
 * handler's behalf. If a handler could write it, one eventually would forget.
 */
export type AuditSpec = {
  /** Table the row belongs to, e.g. `counterparties`. */
  entity: string;
  /** Past-tense verb stored in `audit_log.action`, e.g. `created`. */
  action: string;
};

export type OperationKind = "read" | "write";

export type Operation<
  Input extends z.ZodTypeAny = z.ZodTypeAny,
  Output = unknown,
  Ctx = unknown,
> = {
  /** `verb_noun`, stable. Appears in `agent_tool_calls.tool` and in audit rows. */
  name: string;

  /** One schema, validating the tRPC call **and** the model's tool call. */
  input: Input;

  /**
   * Reads auto-run; writes render a `DiffCard` and wait for approval (§11.2).
   * This is what decides the gate, so it is not optional and not inferred.
   */
  kind: OperationKind;

  /** Whether a bounded auto-mode grant may cover it. Most writes: false. */
  autoEligible: boolean;

  /**
   * Whether this may enter a device outbox. False for anything needing server
   * state the device cannot have — `run_import`, `close_period`,
   * `rerate_transactions`, `materialize_occurrence`, every migration op.
   */
  offlineEligible: boolean;

  /**
   * Payload shape version. Upcasters chain historical versions to current at
   * drain time and the server accepts N−2, because a phone can be offline
   * across two releases (`architecture/08`).
   */
  opVersion: number;

  /**
   * Fields whose modification is gated individually (§11.2). `is_business` is
   * the case this exists for: `update_transaction` is both *recategorise* and
   * the only way to write it, so gating by operation would be too coarse.
   */
  taxSensitiveFields?: readonly string[];

  /** Required on writes: the registry emits the audit row, not the handler. */
  audit?: AuditSpec;

  /**
   * Written **for the model to read**, not for a developer. This is the tool's
   * documentation, and it is the only thing standing between the agent and a
   * plausible misuse of the operation.
   */
  description: string;

  handler: (input: z.output<Input>, ctx: Ctx) => Promise<Output>;
};

/**
 * Declare an operation.
 *
 * Exists to pin inference — without it every call site would have to restate
 * the input type — and to refuse the two declarations that are always
 * mistakes rather than choices.
 */
export function defineOperation<Input extends z.ZodTypeAny, Output, Ctx>(
  op: Operation<Input, Output, Ctx>,
): Operation<Input, Output, Ctx> {
  if (op.kind === "write" && !op.audit) {
    throw new Error(`operation "${op.name}": a write must declare its audit spec`);
  }
  if (op.kind === "read" && op.audit) {
    throw new Error(`operation "${op.name}": a read has nothing to audit`);
  }
  if (!/^[a-z][a-z0-9_]*$/.test(op.name)) {
    throw new Error(`operation "${op.name}": name must be lower_snake_case`);
  }
  return op;
}

/** A registry is a map keyed by name; the key and `name` must agree. */
export type Registry = Readonly<Record<string, Operation<z.ZodTypeAny, unknown, never>>>;
