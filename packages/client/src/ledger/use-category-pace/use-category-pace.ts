/**
 * `useCategoryPace` — the one line under the amount on S05: *Groceries this
 * month: 61% of usual*.
 *
 * **A ratio, never an amount.** The composer's figure is being typed and is
 * not yet a figure; a second amount under it, formatted in prose, would be the
 * one place in the app money is drawn outside `<Amount>`. A percentage of the
 * reader's own habit is the thing that is actually useful while capturing —
 * *is this a lot, for me, this month* — and it needs no currency to read.
 *
 * **"Usual" is the mean of the previous three months that held anything in
 * the category.** Months with nothing are left out rather than averaged in as
 * zero: a category first used two months ago has two months of habit, not
 * three with one blank. With no previous month at all there is no pace, and
 * the line is not drawn — a percentage of nothing is not a fact.
 *
 * **One currency.** `spendByCategory` buckets by currency *and* category, so
 * a category held in two currencies is two rows, and a sum across them adds
 * złoty to euro. The draft has an account and the account has a currency;
 * only that currency's rows are the habit being measured.
 *
 * **A month that nets to nothing or less is not a habit.** Lines carry no
 * positivity check, so a month's category total can be zero or negative (a
 * refund larger than the spend); such months are left out of the mean, and a
 * mean that is not a positive finite number yields no line — `50 / 0` is not
 * *Infinity% of usual*, it is nothing to say.
 *
 * Four `readSpendByCategory` reads, memoised on the category, the currency and
 * the month and invalidated by the snapshot revision — the same shape
 * `useSpendByCategory` keeps. Synchronous SQLite; nothing here awaits.
 */

import { type AccountingDate, accountingDate, shiftMonth, yearMonth } from "@waltning/core/date";
import type { CurrencyCode } from "@waltning/core/money";
import * as money from "@waltning/core/money";
import { useMemo } from "react";
import type { PhoneLedgerController } from "../create-phone-ledger/create-phone-ledger.ts";

const USUAL_MONTHS = 3;

export type CategoryPace = {
  /** This month's spend as a whole percentage of the usual — `61`. */
  percent: number;
};

/** `null` where there is no habit to measure against, or nothing this month. */
export function useCategoryPace(
  ledger: Pick<PhoneLedgerController, "readSpendByCategory">,
  categoryId: string | null,
  currency: CurrencyCode | null,
  today: AccountingDate,
  revision: number,
): CategoryPace | null {
  const month = yearMonth(today.slice(0, 7));
  return useMemo(() => {
    void revision;
    if (categoryId === null || currency === null) return null;
    const spentIn = (m: ReturnType<typeof yearMonth>) => {
      const rows = ledger.readSpendByCategory(
        { start: accountingDate(`${m}-01`), end: accountingDate(`${shiftMonth(m, 1)}-01`) },
        "mine",
      );
      let total = money.ZERO;
      for (const row of rows) {
        if (row.categoryId === categoryId && row.currency === currency) {
          total = money.add(total, row.amount);
        }
      }
      return total;
    };
    const current = spentIn(month);
    if (!money.isPositive(current)) return null;
    let usual = money.ZERO;
    let months = 0;
    for (let back = 1; back <= USUAL_MONTHS; back++) {
      const spent = spentIn(shiftMonth(month, -back));
      if (!money.isPositive(spent)) continue;
      usual = money.add(usual, spent);
      months += 1;
    }
    if (months === 0) return null;
    // Decimal arithmetic to the end; the one `Number` is the whole percentage
    // itself, which is a count and not money.
    const mean = money.dec(usual).div(months);
    if (!mean.isFinite() || !mean.isPositive()) return null;
    const percent = Math.round(money.dec(current).div(mean).times(100).toNumber());
    return Number.isFinite(percent) ? { percent } : null;
  }, [ledger, categoryId, currency, month, revision]);
}
