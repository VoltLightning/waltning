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
import type { JsonValue } from "../json.ts";

/**
 * What a write touches, for the audit row the registry writes on the
 * handler's behalf. If a handler could write it, one eventually would forget.
 */
export type AuditSpec<Input extends z.ZodTypeAny, Output> = {
  /** Table the row belongs to, e.g. `counterparties`. */
  entity: string;
  /** Past-tense verb stored in `audit_log.action`, e.g. `created`. */
  action: string;
  /**
   * The affected row's id. Declared as an extractor rather than guessed from
   * `output.id`, because an operation may return a summary, a list, or nothing
   * that resembles the row it changed — and a wrong `entity_id` makes the audit
   * trail worse than absent, since it points confidently at the wrong row.
   */
  entityId(input: z.output<Input>, output: Output): string;
  /** State before the change, for an update or delete. */
  before?(input: z.output<Input>, output: Output): JsonValue | null;
  /** State after. Omitted for a delete. */
  after?(input: z.output<Input>, output: Output): JsonValue | null;
};

export type OperationKind = "read" | "write";

export type Operation<
  Input extends z.ZodTypeAny,
  Output,
  Ctx,
  /**
   * Carried as a type parameter, not just a field, so the *literal* `"read"`
   * or `"write"` survives to whoever derives from the registry. Without it the
   * field widens to the union and a router generator cannot tell a query from
   * a mutation at the type level — which is how the client ended up with no
   * types at all.
   */
  Kind extends OperationKind = OperationKind,
> = {
  /** `verb_noun`, stable. Appears in `agent_tool_calls.tool` and in audit rows. */
  name: string;

  /** One schema, validating the tRPC call **and** the model's tool call. */
  input: Input;

  /**
   * Reads auto-run; writes render a `DiffCard` and wait for approval (§11.2).
   * This is what decides the gate, so it is not optional and not inferred.
   */
  kind: Kind;

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
  // `| undefined` written out because `exactOptionalPropertyTypes` treats an
  // absent property and one set to undefined as different types, and a
  // declaration that omits this must still satisfy the registry's constraint.
  taxSensitiveFields?: readonly string[] | undefined;

  /** Required on writes: the registry emits the audit row, not the handler. */
  audit?: AuditSpec<Input, Output> | undefined;

  /**
   * Written **for the model to read**, not for a developer. This is the tool's
   * documentation, and it is the only thing standing between the agent and a
   * plausible misuse of the operation.
   */
  description: string;

  /**
   * Declared with method syntax, not as an arrow property, and the difference
   * is load-bearing. Under `strictFunctionTypes` a property-form handler is
   * contravariant in its parameters, so a handler accepting
   * `{ includeArchived: boolean }` is *not* assignable to one accepting a
   * looser input — and a registry holding many operations needs exactly that.
   * Method syntax is bivariant, which is the case it exists for. Inference at
   * the declaration site is unaffected: `defineOperation` still types `input`
   * from the schema.
   */
  handler(input: z.output<Input>, ctx: Ctx): Promise<Output>;

  /**
   * Validate raw input against the declared schema, then run the handler.
   *
   * **The only entry point a generic caller has**, and that is the point.
   * `AnyOperation` omits `handler`, so the router and the agent runtime cannot
   * reach past validation even by accident — the type refuses, rather than
   * relying on both call sites remembering to parse.
   *
   * Built by `defineOperation`; never written by hand.
   */
  invoke(raw: unknown, ctx: Ctx): Promise<Output>;
};

/**
 * Declare an operation.
 *
 * Exists to pin inference — without it every call site would have to restate
 * the input type — and to refuse the two declarations that are always
 * mistakes rather than choices.
 */
export function defineOperation<
  Input extends z.ZodTypeAny,
  Output,
  Ctx,
  Kind extends OperationKind,
>(op: Omit<Operation<Input, Output, Ctx, Kind>, "invoke">): Operation<Input, Output, Ctx, Kind> {
  if (op.kind === "write" && !op.audit) {
    throw new Error(`operation "${op.name}": a write must declare its audit spec`);
  }
  if (op.kind === "read" && op.audit) {
    throw new Error(`operation "${op.name}": a read has nothing to audit`);
  }
  if (!/^[a-z][a-z0-9_]*$/.test(op.name)) {
    throw new Error(`operation "${op.name}": name must be lower_snake_case`);
  }
  return {
    ...op,
    // Parsing here rather than trusting the caller is what makes the widened
    // type safe: a generic consumer holds an operation it cannot invoke
    // without a schema check running first.
    // `async` so a schema failure *rejects* rather than throwing
    // synchronously. The signature promises a Promise; `parse` throws inline,
    // so without this a caller writing `op.invoke(x, ctx).catch(handle)` gets
    // an uncaught exception instead — the failure mode a return type is
    // supposed to rule out.
    invoke: async (raw, ctx) => op.handler(op.input.parse(raw), ctx),
  };
}

/**
 * The loosest operation a registry may hold, for a given context type.
 *
 * `Output` is genuinely unbounded: a registry is heterogeneous by definition,
 * and TypeScript has no existential type for "returns *something*". This is
 * the one place the escape hatch is the language's limit rather than ours, so
 * it is written once, here, in a constraint position where it cannot widen a
 * value — every concrete declaration keeps its real output type through
 * `defineOperation`, and `as const satisfies` preserves it at the call site.
 */
export type AnyOperation<Ctx> = Omit<Operation<z.ZodTypeAny, unknown, Ctx>, "handler">;

/**
 * A registry: operations keyed by name, all sharing one context type.
 *
 * Parameterised by `Ctx` rather than pinned. It was `never`, which is not a
 * type so much as an admission — it made every entry unassignable and pushed
 * a cast to each call site.
 */
export type Registry<Ctx> = Readonly<Record<string, AnyOperation<Ctx>>>;
