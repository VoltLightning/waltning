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

const { currencies, openingDebts, transactions } = schema;

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

/** One row of a settlement: what changed hands, what it discharged, and the debt it pays down. */
export type SplitPart = {
  amount: money.Money;
  discharge: money.Money;
  link: OpeningLink["id"] | null;
};

/**
 * How one payment is written against an existing debt (§6.6): whole and linked
 * when it fits in what is open, whole and ordinary when nothing is open, and
 * **two rows** when it crosses the end — the linked part first, the ordinary
 * rest second. The same plan serves `settle_debt` and an import replacing a
 * payment, so the two cannot disagree about where the boundary falls.
 *
 * The two amounts are the same proportion of what changed hands as of what was
 * discharged, in the account currency's own decimals, the remainder landing on
 * the second row so the account moves by exactly what was paid. **Dust:** where
 * one side rounds to nothing it takes one smallest unit instead, so no
 * zero-amount row is written and the linked discharge stays capped at exactly
 * what is open — and that unit is not a rate, only the smallest figure the row
 * can hold. A payment of a single smallest unit cannot be two rows: it stays
 * whole and **unlinked**.
 */
export function planOpeningSplit(
  tx: ReplicaTx,
  query: {
    link: OpeningLink | null;
    amount: money.Money;
    accountCurrency: typeof transactions.$inferSelect.currency;
    discharge: money.Money;
    /** The debt currency's decimals — what `open` is rounded to. */
    dischargeDecimals: number;
  },
): readonly SplitPart[] {
  const whole: SplitPart = { amount: query.amount, discharge: query.discharge, link: null };
  const { link } = query;
  if (link === null) return [whole];
  const linkedDischarge = money.toMoney(money.round(link.open, query.dischargeDecimals));
  if (money.cmp(linkedDischarge, money.ZERO) <= 0) return [whole];
  if (money.cmp(query.discharge, linkedDischarge) <= 0) return [{ ...whole, link: link.id }];

  const [accountCurrency] = tx
    .select({ decimals: currencies.decimals })
    .from(currencies)
    .where(eq(currencies.code, query.accountCurrency))
    .all();
  const accountDecimals = accountCurrency?.decimals ?? 2;
  const total = money.dec(query.amount);
  const unit = money.dec(1).dividedBy(money.dec(10).pow(accountDecimals));
  let linkedAmount = money.dec(
    money.round(
      money.toMoney(total.times(money.dec(linkedDischarge)).dividedBy(money.dec(query.discharge))),
      accountDecimals,
    ),
  );
  if (linkedAmount.lte(0)) linkedAmount = unit;
  if (total.minus(linkedAmount).lte(0)) linkedAmount = total.minus(unit);
  if (linkedAmount.lte(0) || total.minus(linkedAmount).lte(0)) return [whole];
  return [
    { amount: money.toMoney(linkedAmount), discharge: linkedDischarge, link: link.id },
    {
      amount: money.toMoney(total.minus(linkedAmount)),
      discharge: money.toMoney(money.sub(query.discharge, linkedDischarge)),
      link: null,
    },
  ];
}
