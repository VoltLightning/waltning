/**
 * `SPEC.md` §6.6 on the replica's write path: a row filed under one of the four
 * debt categories (*Borrowed*, *Lent out*, *Repayment received*, *Repayment
 * made*) is a debt — the `debt` obligation role and a person on the other side.
 *
 * **The service layer of a rule that has two more.** These functions give the
 * refusal a real message that names the operation and the field; under them the
 * replica's `transactions_debt_category_shape_*` triggers (`migrate.ts`,
 * `DEBT_CATEGORY_TRIGGERS`) and Postgres's `transactions_debt_category_shape`
 * (WA022, `0025_debt_categories.sql`) hold when this code is wrong.
 *
 * **Identified by the seed tag, never the name** (`@waltning/core/taxonomy`'s
 * `DEBT_SEED_EXTERNAL_IDS`): a renamed or translated seed category is still one,
 * and a category someone made and called *Borrowed* is not.
 */

import type { Id } from "@waltning/core/id";
import { DEBT_SEED_EXTERNAL_IDS } from "@waltning/core/taxonomy";
import { eq, inArray } from "drizzle-orm";
import { LocalRefusal } from "../executor.ts";
import { type ReplicaTx, ledgerSchema as schema } from "../schema-map.ts";

const { categories, transactions } = schema;

/** Whether this category is one of the four — `false` for none, for an unknown id and for a person's own. */
export function isDebtCategory(
  tx: ReplicaTx,
  categoryId: Id<"categories"> | null | undefined,
): boolean {
  if (categoryId === null || categoryId === undefined) return false;
  const row = tx
    .select({ externalId: categories.externalId })
    .from(categories)
    .where(eq(categories.id, categoryId))
    .get();
  return row?.externalId != null && DEBT_SEED_EXTERNAL_IDS.includes(row.externalId);
}

/** Every live category id that is one of the four — for a bulk statement that has no single row to ask about. */
export function debtCategoryIds(tx: ReplicaTx): Id<"categories">[] {
  return tx
    .select({ id: categories.id })
    .from(categories)
    .where(inArray(categories.externalId, [...DEBT_SEED_EXTERNAL_IDS]))
    .all()
    .map((row) => row.id);
}

export type ObligationFields = {
  obligationCounterpartyId?: string | null | undefined;
  obligationRole?: string | null | undefined;
};

/**
 * Refuses a debt category without its debt: `where` is what the operation and
 * field are called in the message (`"create_transaction: category_id"`).
 */
export function assertDebtCategoryShape(
  tx: ReplicaTx,
  categoryId: Id<"categories"> | null | undefined,
  obligation: ObligationFields,
  where: string,
): void {
  if (!isDebtCategory(tx, categoryId)) return;
  if (obligation.obligationRole !== "debt" || !obligation.obligationCounterpartyId) {
    throw new LocalRefusal(
      `${where}: category ${categoryId} is a debt category (SPEC §6.6) — the row needs the debt ` +
        "role and the person on the other side (obligation_counterparty_id, obligation_role = debt)",
    );
  }
}

/**
 * **Leaving a debt category takes the automatic role with it.** A patch that
 * moves a row out of one of the four and says nothing about the obligation
 * clears the pair (the identity link stays — who it was with is still true),
 * because under these categories the role is the category's, not a choice. A
 * patch that names the obligation fields is taken at its word.
 */
export function obligationAfterLeaving(
  tx: ReplicaTx,
  current: { categoryId: Id<"categories"> | null; obligationRole: string | null },
  patch: { categoryId?: Id<"categories"> | null | undefined },
  obligationInPatch: boolean,
): { obligationCounterpartyId: null; obligationRole: null } | undefined {
  if (obligationInPatch || !("categoryId" in patch)) return undefined;
  if (current.obligationRole !== "debt") return undefined;
  if (!isDebtCategory(tx, current.categoryId) || isDebtCategory(tx, patch.categoryId)) {
    return undefined;
  }
  return { obligationCounterpartyId: null, obligationRole: null };
}

/** Which of the named rows would break the rule under `categoryId` — for a bulk re-categorisation. */
export function rowsMissingDebt(
  tx: ReplicaTx,
  transactionIds: readonly Id<"transactions">[],
): Id<"transactions">[] {
  return tx
    .select({
      id: transactions.id,
      role: transactions.obligationRole,
      person: transactions.obligationCounterpartyId,
    })
    .from(transactions)
    .where(inArray(transactions.id, [...transactionIds]))
    .all()
    .filter((row) => row.role !== "debt" || row.person === null)
    .map((row) => row.id);
}
