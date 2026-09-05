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

import type { AccountingDate } from "@waltning/core/date";
import type { Id } from "@waltning/core/id";
import type * as money from "@waltning/core/money";
import type { DbHandle } from "@waltning/db/client";
import { signedFromLeg } from "@waltning/db/figures/signed.sql";
import {
  accounts,
  categories,
  currencies,
  transactionLines,
  transactions,
} from "@waltning/db/schema";
import type { CounterpartyRole } from "@waltning/schema/enums";
import { and, asc, desc, eq, gte, inArray, isNull, lt, lte, or, type SQL } from "drizzle-orm";

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

/** S10 §3 — the four values `SegmentControl` offers, exactly `SPEC.md` §6.7's partition. */
export type SearchScope = "all" | "mine" | "shared" | "business";

export type SearchTransactionsFilter = {
  /**
   * **Not yet applied.** §13's trigram match needs `pg_trgm` and a GIN index
   * — a migration, and this fix round's own ruling is no migrations here
   * (another branch holds the next migration numbers). Accepted on the
   * input so the shape already matches the phone's `TransactionSearchFilter`
   * and the field is not silently dropped at validation; every other filter
   * below is a plain structural `WHERE` and needs no schema change.
   */
  text?: string | undefined;
  accountIds?: readonly Id<"accounts">[] | undefined;
  categoryIds?: readonly Id<"categories">[] | undefined;
  scope?: SearchScope | undefined;
  from?: AccountingDate | undefined;
  to?: AccountingDate | undefined;
  counterpartyId?: Id<"counterparties"> | undefined;
  counterpartyRole?: CounterpartyRole | undefined;
};

function scopeCondition(scope: SearchScope): SQL | undefined {
  switch (scope) {
    case "all":
      return undefined;
    case "mine":
      return and(eq(accounts.ownership, "own"), eq(transactions.isBusiness, false));
    case "business":
      return eq(transactions.isBusiness, true);
    case "shared":
      return eq(accounts.ownership, "shared");
  }
}

export async function searchTransactions(
  db: DbHandle,
  filter: SearchTransactionsFilter,
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
  const accountIds = filter.accountIds ?? [];
  const categoryIds = filter.categoryIds ?? [];

  const structural: (SQL | undefined)[] = [
    isNull(transactions.deletedAt),
    filter.from !== undefined ? gte(transactions.date, filter.from) : undefined,
    filter.to !== undefined ? lte(transactions.date, filter.to) : undefined,
    accountIds.length > 0
      ? or(
          inArray(transactions.accountId, [...accountIds]),
          inArray(transactions.toAccountId, [...accountIds]),
        )
      : undefined,
    categoryIds.length > 0 ? inArray(transactions.categoryId, [...categoryIds]) : undefined,
    scopeCondition(filter.scope ?? "all"),
    filter.counterpartyId !== undefined
      ? eq(transactions.counterpartyId, filter.counterpartyId)
      : undefined,
    filter.counterpartyRole !== undefined
      ? eq(transactions.counterpartyRole, filter.counterpartyRole)
      : undefined,
    cursor
      ? or(
          lt(transactions.date, cursor.date),
          and(eq(transactions.date, cursor.date), lt(transactions.id, cursor.id)),
        )
      : undefined,
  ];

  // One more than asked for: whether a next page exists is a fact about the
  // data, not a guess from `rows.length === limit` — which is wrong exactly
  // when the last page is full.
  const rows = await db
    .select({
      id: transactions.id,
      date: transactions.date,
      type: transactions.type,
      payee: transactions.payee,
      amount: signedFromLeg,
      currency: transactions.currency,
      accountName: accounts.name,
      categoryName: categories.name,
    })
    .from(transactions)
    .innerJoin(accounts, eq(accounts.id, transactions.accountId))
    .leftJoin(categories, eq(categories.id, transactions.categoryId))
    .where(and(...structural.filter((c): c is SQL => c !== undefined)))
    .orderBy(desc(transactions.date), desc(transactions.id))
    .limit(limit + 1);

  const page = rows.slice(0, limit);
  const last = page.at(-1);

  return {
    rows: page,
    nextCursor: rows.length > limit && last ? { date: last.date, id: last.id } : null,
  };
}

export type TransactionLineRow = {
  id: string;
  description: string;
  amount: money.Money;
  categoryId: string | null;
  categoryName: string | null;
};

export type TransactionDetail = {
  id: string;
  date: string;
  type: "income" | "expense" | "transfer" | "adjustment";
  payee: string;
  note: string;
  isBusiness: boolean;
  accountId: string;
  accountName: string;
  categoryId: string | null;
  categoryName: string | null;
  amount: money.Money;
  currency: string;
  decimals: number;
  version: number;
  lines: TransactionLineRow[];
};

/**
 * `get_transaction` — S09's whole subject, one query plus lines, mirroring
 * `@waltning/ledger`'s `readTransaction` field-for-field. `null` for a row
 * that does not exist or is soft-deleted (§6.9) — the same "not there" a
 * caller gets for either.
 */
export async function getTransactionById(
  db: DbHandle,
  transactionId: Id<"transactions">,
): Promise<TransactionDetail | null> {
  const [row] = await db
    .select({
      id: transactions.id,
      date: transactions.date,
      type: transactions.type,
      payee: transactions.payee,
      note: transactions.note,
      isBusiness: transactions.isBusiness,
      accountId: transactions.accountId,
      accountName: accounts.name,
      categoryId: transactions.categoryId,
      categoryName: categories.name,
      amount: signedFromLeg,
      currency: transactions.currency,
      decimals: currencies.decimals,
      version: transactions.version,
    })
    .from(transactions)
    .innerJoin(accounts, eq(transactions.accountId, accounts.id))
    .innerJoin(currencies, eq(transactions.currency, currencies.code))
    .leftJoin(categories, eq(transactions.categoryId, categories.id))
    .where(and(eq(transactions.id, transactionId), isNull(transactions.deletedAt)));

  if (!row) return null;

  const lines = await db
    .select({
      id: transactionLines.id,
      description: transactionLines.description,
      amount: transactionLines.amount,
      categoryId: transactionLines.categoryId,
      categoryName: categories.name,
    })
    .from(transactionLines)
    .leftJoin(categories, eq(transactionLines.categoryId, categories.id))
    .where(eq(transactionLines.transactionId, transactionId))
    .orderBy(asc(transactionLines.sort), asc(transactionLines.id));

  return { ...row, lines };
}
