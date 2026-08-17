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
import type { Operation } from "./operation.ts";

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

/** Which declared tax-sensitive fields this particular call actually writes. */
export function sensitiveFieldsWritten(
  op: Pick<Operation<z.ZodTypeAny, unknown, unknown>, "taxSensitiveFields">,
  input: unknown,
): readonly string[] {
  const declared = op.taxSensitiveFields;
  if (!declared?.length || input === null || typeof input !== "object") return [];
  const keys = new Set(Object.keys(input as Record<string, unknown>));
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
  op: Pick<
    Operation<z.ZodTypeAny, unknown, unknown>,
    "name" | "kind" | "autoEligible" | "taxSensitiveFields"
  >,
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
