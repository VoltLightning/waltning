import type { AccountingDate } from "@waltning/core/date";
import type { Id } from "@waltning/core/id";
import type { CurrencyCode, Money } from "@waltning/core/money";
import * as money from "@waltning/core/money";
import type { CounterpartyRole, TxnType } from "@waltning/schema/enums";
import { and, eq, gte, inArray, isNull, lte, or, type SQL } from "drizzle-orm";
import { alias } from "drizzle-orm/sqlite-core";
import type { ReplicaDb } from "../open.ts";
import { ledgerSchema } from "../schema-map.ts";
import type { TransactionSearchFilter, TransactionSearchScope } from "./search-transactions.ts";

const { accounts, categories, currencies, transactions } = ledgerSchema;

/**
 * The three pieces two readers must share, extracted rather than duplicated.
 *
 * `searchTransactions` answers S10's question — *find the thing you remember*
 * — and `readLedgerPage` answers S04's — *where am I in the ledger*. They
 * disagree about paging (one direction against two), about totals (a running
 * one against none) and about text (folded in JS against not offered at
 * all). What they must never disagree about is **which rows a filter admits,
 * what a row looks like, and what sign its money carries**: two readers over
 * one ledger that answer those differently produce a list whose filtered view
 * and whose scrolled view are quietly different ledgers.
 *
 * So those three live here, and each reader keeps only its own question.
 */

/** `SPEC.md` §6.7's partition, as a `WHERE` clause. */
export function scopeCondition(scope: TransactionSearchScope): SQL | undefined {
  switch (scope) {
    // Mine = own accounts, not business. Business = always own.
    // Shared = ownership=shared, never business (constrained against on `accounts`).
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

/**
 * Everything in a filter that SQL can decide — which is all of it except
 * `text`, whose fold has no SQLite equivalent (`searchTransactions`'s own
 * doc). Always includes the liveness clause: a reader that forgot
 * `deletedAt IS NULL` would show deleted rows in one view and not the other.
 */
export function structuralWhere(filter: TransactionSearchFilter): SQL | undefined {
  const accountIds = filter.accountIds ?? [];
  const categoryIds = filter.categoryIds ?? [];
  const conditions: (SQL | undefined)[] = [
    isNull(transactions.deletedAt),
    filter.from !== undefined ? gte(transactions.date, filter.from) : undefined,
    filter.to !== undefined ? lte(transactions.date, filter.to) : undefined,
    accountIds.length > 0
      ? or(
          inArray(transactions.accountId, accountIds),
          inArray(transactions.toAccountId, accountIds),
        )
      : undefined,
    categoryIds.length > 0 ? inArray(transactions.categoryId, categoryIds) : undefined,
    filter.currency !== undefined
      ? or(eq(transactions.currency, filter.currency), eq(transactions.toCurrency, filter.currency))
      : undefined,
    scopeCondition(filter.scope ?? "all"),
    filter.counterpartyId !== undefined
      ? eq(transactions.counterpartyId, filter.counterpartyId)
      : undefined,
    filter.counterpartyRole !== undefined
      ? eq(transactions.counterpartyRole, filter.counterpartyRole)
      : undefined,
  ];
  return and(...conditions.filter((c): c is SQL => c !== undefined));
}

/**
 * A display row after `signRow` — every join a rendered transaction needs,
 * with its money already signed. Named rather than inferred because both
 * readers hand it onward as `LocalSearchTransaction`, and an inferred shape
 * that drifted would fail at the far call site rather than here.
 */
export type SignedLedgerRow = {
  id: Id<"transactions">;
  date: AccountingDate;
  type: TxnType;
  payee: string;
  note: string;
  brandKey: string | null;
  categoryName: string | null;
  accountId: Id<"accounts">;
  accountName: string;
  toAccountId: Id<"accounts"> | null;
  toAccountName: string | null;
  amountOriginal: Money;
  amount: Money;
  currency: CurrencyCode;
  decimals: number;
  toAmount: Money | null;
  toCurrency: CurrencyCode | null;
  toDecimals: number | null;
  isBusiness: boolean;
  isCapital: boolean;
  counterpartyRole: CounterpartyRole | null;
};

/**
 * The display row, with every join a rendered transaction needs. Returns a
 * builder rather than a result so each caller adds its own `where`, `orderBy`
 * and `limit` — the parts that differ — to a select list that does not.
 */
export function ledgerRowsQuery<TRun, TSchema extends typeof ledgerSchema>(
  db: ReplicaDb<TRun, TSchema>,
) {
  const toAccounts = alias(accounts, "to_accounts");
  const toCurrencies = alias(currencies, "to_currencies");
  return db
    .select({
      id: transactions.id,
      date: transactions.date,
      type: transactions.type,
      payee: transactions.payee,
      note: transactions.note,
      brandKey: transactions.brandKey,
      categoryName: categories.name,
      accountId: transactions.accountId,
      accountName: accounts.name,
      toAccountId: transactions.toAccountId,
      toAccountName: toAccounts.name,
      amountOriginal: transactions.amountOriginal,
      toAmountRaw: transactions.toAmount,
      currency: transactions.currency,
      decimals: currencies.decimals,
      toCurrency: transactions.toCurrency,
      toDecimals: toCurrencies.decimals,
      isBusiness: transactions.isBusiness,
      isCapital: transactions.isCapital,
      counterpartyRole: transactions.counterpartyRole,
    })
    .from(transactions)
    .innerJoin(accounts, eq(transactions.accountId, accounts.id))
    .innerJoin(currencies, eq(transactions.currency, currencies.code))
    .leftJoin(toAccounts, eq(transactions.toAccountId, toAccounts.id))
    .leftJoin(toCurrencies, eq(transactions.toCurrency, toCurrencies.code))
    .leftJoin(categories, eq(transactions.categoryId, categories.id));
}

/**
 * `money.ts#signed` per leg — income against expense against a transfer's two
 * (`SPEC.md` §7.2). Not expressible in SQL, and the reason both readers fold
 * rows in JS rather than asking SQLite for a `SUM`.
 */
export function signRow<
  Row extends { amountOriginal: Money; toAmountRaw: Money | null; type: TxnType },
>({ amountOriginal, toAmountRaw, type, ...row }: Row) {
  return {
    ...row,
    amount: money.signed({ type, amountOriginal, toAmount: toAmountRaw }, "from"),
    toAmount:
      type === "transfer"
        ? money.signed({ type, amountOriginal, toAmount: toAmountRaw }, "to")
        : null,
    type,
    amountOriginal,
  };
}
