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
import { DEBT_SEED_EXTERNAL_IDS, REPAYMENT_SEED_EXTERNAL_IDS } from "@waltning/core/taxonomy";
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

/** Whether this category is *Repayment received* or *Repayment made* — the two only `settle_debt` writes. */
export function isRepaymentCategory(
  tx: ReplicaTx,
  categoryId: Id<"categories"> | null | undefined,
): boolean {
  if (categoryId === null || categoryId === undefined) return false;
  const row = tx
    .select({ externalId: categories.externalId })
    .from(categories)
    .where(eq(categories.id, categoryId))
    .get();
  return row?.externalId != null && REPAYMENT_SEED_EXTERNAL_IDS.includes(row.externalId);
}

/**
 * **A row enters a repayment category only through `settle_debt`.** A plain
 * write under *Repayment received* would carry the debt role without the
 * discharge in the debt's currency, without the direction check and without
 * "nothing to settle" — and, against a debt the other way round, would quietly
 * open a reverse one. `settle_debt` passes `settlement: true`; everyone else
 * (the agent, a plain `update_transaction`, `categorize_batch`) is refused with
 * a message that names the way in.
 */
export function assertNotRepaymentEntry(
  tx: ReplicaTx,
  categoryId: Id<"categories"> | null | undefined,
  where: string,
): void {
  if (!isRepaymentCategory(tx, categoryId)) return;
  throw new LocalRefusal(
    `${where}: category ${categoryId} is a repayment category (SPEC §6.6) — a repayment is written ` +
      "by settle_debt, which discharges the debt it pays; use settle_debt",
  );
}

/**
 * **A split line is never filed under a debt category.** A line carries no
 * obligation of its own, so a line under *Borrowed* would be a debt with nobody
 * on the other side; a debt is the whole transaction, with its person.
 */
export function assertLineNotDebtCategory(
  tx: ReplicaTx,
  categoryId: Id<"categories"> | null | undefined,
  where: string,
): void {
  if (!isDebtCategory(tx, categoryId)) return;
  throw new LocalRefusal(
    `${where}: category ${categoryId} is a debt category (SPEC §6.6) — a split line has no ` +
      "person to owe or be owed; file the whole transaction under it instead",
  );
}

export type ObligationFields = {
  obligationCounterpartyId?: string | null | undefined;
  obligationRole?: string | null | undefined;
};

/**
 * **The obligation is a pair: a person and what is owed with them, both or
 * neither** (`transactions_obligation_pair_shape` on Postgres, and the
 * replica's `transactions_obligation_pair_shape_*` triggers). A person with no
 * role is a row the server would refuse when the outbox drains, so it is
 * refused here, where the device can say why.
 */
export function assertObligationPair(obligation: ObligationFields, where: string): void {
  const person = obligation.obligationCounterpartyId != null;
  const role = obligation.obligationRole != null;
  if (person === role) return;
  throw new LocalRefusal(
    `${where}: an obligation and its role travel together (SPEC §6.6) — ` +
      "obligation_counterparty_id and obligation_role are both set or both empty",
  );
}

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
 * **Leaving a debt category takes the automatic role with it — and the
 * discharge figure that role stamped.** A write that moves a row out of one of
 * the four clears `debt_amount` and `debt_currency` (they describe a settlement
 * that is no longer one, and must not come back if the row re-enters a debt
 * category), and — when it says nothing about the obligation — the obligation
 * pair too (the identity link stays: who it was with is still true). A write
 * that names the obligation fields is taken at its word for the pair.
 */
export function leavingDebtCategory(
  tx: ReplicaTx,
  current: { categoryId: Id<"categories"> | null; obligationRole: string | null },
  patch: { categoryId?: Id<"categories"> | null | undefined },
  obligationInPatch: boolean,
):
  | { debtAmount: null; debtCurrency: null }
  | {
      debtAmount: null;
      debtCurrency: null;
      obligationCounterpartyId: null;
      obligationRole: null;
    }
  | undefined {
  if (!("categoryId" in patch)) return undefined;
  if (!isDebtCategory(tx, current.categoryId) || isDebtCategory(tx, patch.categoryId)) {
    return undefined;
  }
  if (obligationInPatch || current.obligationRole !== "debt") {
    return { debtAmount: null, debtCurrency: null };
  }
  return {
    debtAmount: null,
    debtCurrency: null,
    obligationCounterpartyId: null,
    obligationRole: null,
  };
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
