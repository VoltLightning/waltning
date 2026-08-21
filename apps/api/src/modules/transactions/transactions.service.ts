/**
 * Reading the ledger.
 *
 * **Cursor-paginated on `(date, id)`, never an offset.** An offset drifts under
 * concurrent inserts: a row added while someone is paging shifts everything
 * after it, so page 2 re-shows a row from page 1 or skips one entirely. In a
 * list of money that reads as a duplicate or a disappearance.
 *
 * The amount comes back **signed by type**, matching `computations.md` §1, so a
 * screen never has to know that an expense is stored positive. A component
 * deciding the sign for itself is a second implementation of §1, and the two
 * would disagree on `adjustment` — which carries its own sign.
 */

import type { AccountingDate, Id, money } from "@waltning/core";
import { accounts, categories, type DbHandle, transactions } from "@waltning/db";
import { and, desc, eq, isNull, lt, or, sql } from "drizzle-orm";

export type TransactionRow = {
  id: string;
  /** Bare `YYYY-MM-DD`. No timezone was applied and none should be. */
  date: string;
  type: "income" | "expense" | "transfer" | "adjustment";
  payee: string;
  /** Signed per §1, as a decimal string in the account's currency. */
  amount: money.Money;
  currency: string;
  accountName: string;
  categoryName: string | null;
};

export type TransactionPage = {
  rows: TransactionRow[];
  /** Feed back as `cursor` for the next page; `null` when there are no more. */
  nextCursor: { date: string; id: string } | null;
};

/** §1's `signed(t,'from')`, in SQL so there is one implementation of it. */
const signedAmount = sql<money.Money>`
  CASE ${transactions.type}
    WHEN 'expense'  THEN -${transactions.amountOriginal}
    WHEN 'transfer' THEN -${transactions.amountOriginal}
    ELSE                   ${transactions.amountOriginal}
  END`;

export async function listTransactions(
  db: DbHandle,
  limit: number,
  /**
   * **Branded, because a cursor is client input.** It is echoed back from a
   * previous response, so it *looks* internal — and it arrives in a request
   * body like everything else, which means a caller can send anything. It is
   * compared against branded columns here, so it is parsed at the operation's
   * Zod boundary rather than trusted for looking familiar.
   */
  cursor: { date: AccountingDate; id: Id<"transactions"> } | null,
): Promise<TransactionPage> {
  // One more than asked for: whether a next page exists is a fact about the
  // data, not a guess from `rows.length === limit` — which is wrong exactly
  // when the last page is full.
  const rows = await db
    .select({
      id: transactions.id,
      date: transactions.date,
      type: transactions.type,
      payee: transactions.payee,
      amount: signedAmount,
      currency: transactions.currency,
      accountName: accounts.name,
      categoryName: categories.name,
    })
    .from(transactions)
    .innerJoin(accounts, eq(accounts.id, transactions.accountId))
    .leftJoin(categories, eq(categories.id, transactions.categoryId))
    .where(
      and(
        isNull(transactions.deletedAt),
        cursor
          ? or(
              lt(transactions.date, cursor.date),
              and(eq(transactions.date, cursor.date), lt(transactions.id, cursor.id)),
            )
          : undefined,
      ),
    )
    .orderBy(desc(transactions.date), desc(transactions.id))
    .limit(limit + 1);

  const page = rows.slice(0, limit);
  const last = page.at(-1);

  return {
    rows: page,
    nextCursor: rows.length > limit && last ? { date: last.date, id: last.id } : null,
  };
}
