/**
 * The approval gate — §11.2.
 *
 * **The tax boundary is a field boundary; the grant is an operation boundary.**
 * That mismatch is the whole reason this file exists. "Anything touching tax
 * scope" cannot be expressed as a list of operation names, because the
 * operation you would obviously auto-grant is the one that can cross it:
 * `update_transaction` sets `category_id` — recategorisation, the motivating
 * example — and the same operation sets `is_business`, `ryczalt_rate` and
 * `ryczalt_activity`.
 *
 * Grant recategorisation for a session, and one tool call could move forty rows
 * out of the tax view with no approval and no distinguishing mark. Under
 * ryczałt the damaging direction is *out*, and §13.1's entire argument is that
 * this cannot happen.
 *
 * So eligibility is evaluated against **the fields the call actually writes**,
 * not the operation it belongs to.
 */

import type { z } from "zod";
import type { Operation, OperationKind } from "./operation.ts";

/**
 * Fields that are never auto-eligible, whatever grant is in force (§11.2).
 *
 * `date` is here because it decides which period a row belongs to, and a
 * period can be closed. `is_pivot` and `ownership` are here because they
 * reinterpret every stored figure that depends on them rather than changing
 * one row.
 *
 * A category change *can* move tax scope indirectly — `is_earnings` feeds
 * `tax_omission_candidates` — and is deliberately not listed: that is a report,
 * checked at close (§13.4), not a write. The point of this list is that nothing
 * silently changes a filed figure, not that no figure may ever move.
 */
export const TAX_SENSITIVE_FIELDS = [
  "is_business",
  "ryczalt_rate",
  "ryczalt_activity",
  "counterparty_tax_id",
  "date",
  "ownership",
  "is_pivot",
] as const;

export type TaxSensitiveField = (typeof TAX_SENSITIVE_FIELDS)[number];

/**
 * A bounded auto-mode grant (§11.2): opt-in, scoped, never permanent.
 * `null` means the default — every write gates.
 */
export type AutoGrant = {
  /** Operation names this grant covers. Deletes and config changes never appear. */
  operations: readonly string[];
  /** The session, or a stated number of operations. Never open-ended. */
  expiresAt: Date;
} | null;

export type GateDecision =
  | { gated: false }
  | {
      gated: true;
      reason: "write-by-default" | "not-auto-eligible" | "grant-expired" | "tax-sensitive-field";
      /** Populated for `tax-sensitive-field`: what the approval card must show. */
      fields: readonly string[];
    };

/**
 * The part of an operation the gate reads, named once.
 *
 * **This was `Pick<Operation<z.ZodTypeAny, unknown, unknown>, …>`**, and the two
 * `unknown`s were placeholders — the gate never looks at an operation's output
 * or its context, so both type arguments existed only to satisfy the arity of a
 * type nothing here needed. `apps/api/src/registry/define.ts` had already
 * noticed and written the same four fields out longhand, which is the usual
 * shape of this smell: a placeholder generic that callers route around.
 *
 * Naming the fields directly removes both placeholders and the second copy.
 * `Operation` is still asserted to satisfy it below, so the two cannot drift.
 */
export type GateFields = {
  name: string;
  kind: OperationKind;
  autoEligible: boolean;
  taxSensitiveFields?: readonly string[] | undefined;
};

/**
 * An operation is gateable. A compile-time assertion rather than a comment, so
 * renaming a field on `Operation` fails here instead of silently making
 * `GateFields` describe something that no longer exists.
 */
export type OperationIsGateable =
  Operation<z.ZodTypeAny, never, never> extends GateFields ? true : never;

/**
 * A call's input, as the gate needs to read it: a bag of field names.
 *
 * `unknown` in the **value** position of a heterogeneous record is the use
 * `CLAUDE.md` sanctions — the gate compares *keys* and never touches a value,
 * so a narrower value type would be a claim it does not make and cannot check.
 * `input` itself stays `unknown` because this is a runtime boundary: a caller
 * can hand it `null` or a string, and there is a test that does.
 */
type FieldBag = Readonly<Record<string, unknown>>;

const isFieldBag = (input: unknown): input is FieldBag =>
  input !== null && typeof input === "object";

/** Which declared tax-sensitive fields this particular call actually writes. */
export function sensitiveFieldsWritten(
  op: Pick<GateFields, "taxSensitiveFields">,
  input: unknown,
): readonly string[] {
  const declared = op.taxSensitiveFields;
  if (!declared?.length || !isFieldBag(input)) return [];
  // A guard rather than `input as Record<string, unknown>`: the cast asserted
  // what the line above actually proves, so the two could disagree.
  const keys = new Set(Object.keys(input));
  return declared.filter((field) => keys.has(field));
}

/**
 * Whether this call needs approval.
 *
 * Reads never gate. Writes gate by default. A grant can lift that — but never
 * for a call that names a tax-sensitive field, whatever else it also sets, and
 * the approval card then shows only those fields with the rest already applied.
 */
export function gateDecision(
  op: GateFields,
  input: unknown,
  grant: AutoGrant,
  now: Date,
): GateDecision {
  if (op.kind === "read") return { gated: false };

  const sensitive = sensitiveFieldsWritten(op, input);
  // Checked before the grant, so an expired or absent grant cannot make a
  // tax-sensitive write look like an ordinary one in the audit trail.
  if (sensitive.length > 0) {
    return { gated: true, reason: "tax-sensitive-field", fields: sensitive };
  }

  if (!op.autoEligible) return { gated: true, reason: "not-auto-eligible", fields: [] };
  if (!grant) return { gated: true, reason: "write-by-default", fields: [] };
  if (!grant.operations.includes(op.name)) {
    return { gated: true, reason: "write-by-default", fields: [] };
  }
  if (grant.expiresAt.getTime() <= now.getTime()) {
    return { gated: true, reason: "grant-expired", fields: [] };
  }

  return { gated: false };
}
