/**
 * Which opening debt, if any, a repayment pays down (§6.6) — the one rule
 * `settle_debt` and `update_transaction` share, so that what is linked when a
 * settlement is written and what is linked when it is edited cannot differ.
 *
 * **A repayment is linked only to what is still open on the opening debt, and
 * only when it reduces the opening debt's own direction.**
 *
 * - *Still open.* The opening debt is the **oldest** debt a person has — it
 *   predates the ledger — so FIFO (§7, the order ageing uses) consumes it
 *   first. What the linked repayments so far have discharged is subtracted
 *   from its figure, and a repayment is linked up to what remains. Past that
 *   it is an ordinary repayment of an ordinary debt: deleting the opening debt
 *   must never delete a real one.
 * - *Own direction.* `theyOwe` is paid down by money coming in (`income`),
 *   `youOwe` by money going out (`expense`). A repayment the other way is
 *   paying down some other debt, even though it shares a person and a
 *   currency.
 *
 * Returns `null` when there is no live opening debt in the currency, the
 * repayment points the wrong way, or nothing is left open.
 */

import * as money from "@waltning/core/money";
import { and, eq, isNull, ne } from "drizzle-orm";
import { type ReplicaTx, ledgerSchema as schema } from "../schema-map.ts";

const { openingDebts, transactions } = schema;

export type OpeningLink = {
  id: typeof openingDebts.$inferSelect.id;
  /** What is still open on the opening debt, in its own currency. */
  open: money.Money;
};

export function openingLinkFor(
  tx: ReplicaTx,
  query: {
    counterpartyId: typeof openingDebts.$inferSelect.counterpartyId;
    currency: typeof openingDebts.$inferSelect.currency;
    /** The settlement's own type: `income` pays down `theyOwe`, `expense` pays down `youOwe`. */
    type: "income" | "expense";
    /** A row to leave out of what has been repaid — the one being re-derived. */
    excluding?: typeof transactions.$inferSelect.id;
  },
): OpeningLink | null {
  const [debt] = tx
    .select()
    .from(openingDebts)
    .where(
      and(
        eq(openingDebts.counterpartyId, query.counterpartyId),
        eq(openingDebts.currency, query.currency),
        isNull(openingDebts.deletedAt),
      ),
    )
    .all();
  if (!debt) return null;
  if ((debt.direction === "theyOwe") !== (query.type === "income")) return null;

  const repaid = tx
    .select({ amount: transactions.debtAmount, own: transactions.amountOriginal })
    .from(transactions)
    .where(
      and(
        eq(transactions.settlesOpeningDebtId, debt.id),
        isNull(transactions.deletedAt),
        query.excluding === undefined ? undefined : ne(transactions.id, query.excluding),
      ),
    )
    .all()
    .reduce((sum, row) => money.add(sum, row.amount ?? row.own), money.ZERO);

  const open = money.sub(debt.amount, repaid);
  return money.cmp(open, money.ZERO) > 0 ? { id: debt.id, open } : null;
}
