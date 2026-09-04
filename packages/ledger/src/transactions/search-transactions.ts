import { fold } from "@waltning/core/capture/names";
import type { AccountingDate } from "@waltning/core/date";
import type { Id } from "@waltning/core/id";
import type { CurrencyCode, Money } from "@waltning/core/money";
import * as money from "@waltning/core/money";
import type { TxnType } from "@waltning/schema/enums";
import { and, desc, eq, gte, inArray, isNull, lte, or, type SQL } from "drizzle-orm";
import { alias } from "drizzle-orm/sqlite-core";
import type { ReplicaDb } from "../open.ts";
import { ledgerSchema } from "../schema-map.ts";

const { accounts, categories, currencies, transactions } = ledgerSchema;

/** S10 §3 — the four values `SegmentControl` offers, exactly `SPEC.md` §6.7's partition. */
export type TransactionSearchScope = "all" | "mine" | "shared" | "business";

export type TransactionSearchFilter = {
  /** Folded and matched against payee, note, and the amount's digits (§13). */
  text?: string;
  /** Matches either leg — a transfer touching a filtered account still shows. */
  accountIds?: readonly Id<"accounts">[];
  categoryIds?: readonly Id<"categories">[];
  scope?: TransactionSearchScope;
  from?: AccountingDate;
  to?: AccountingDate;
};

export type TransactionSearchCursor = { date: AccountingDate; id: Id<"transactions"> };

export type LocalSearchTransaction = {
  id: Id<"transactions">;
  date: AccountingDate;
  type: TxnType;
  payee: string;
  note: string;
  categoryName: string | null;
  accountId: Id<"accounts">;
  accountName: string;
  /** Present only on a transfer (`toAccountId` is the schema's own transfer marker). */
  toAccountId: Id<"accounts"> | null;
  toAccountName: string | null;
  /** Already signed, the "from" leg — `money.ts#signed`. */
  amount: Money;
  currency: CurrencyCode;
  decimals: number;
  /** Already signed, the "to" leg. `null` off a transfer. */
  toAmount: Money | null;
  toCurrency: CurrencyCode | null;
  toDecimals: number | null;
  isBusiness: boolean;
  isCapital: boolean;
};

export type CurrencyTotal = {
  currency: CurrencyCode;
  decimals: number;
  /** Every live row in range, this currency, both legs of a transfer counted separately. */
  sum: Money;
  /** The same sum with every `isCapital` row's leg left out — S10 §9. */
  sumExcludingCapital: Money;
  /** How many legs of `sum` were capital — 0 means the second total is not worth drawing. */
  capitalCount: number;
};

export type TransactionSearchTotals = {
  /** Distinct transactions, not currency-total legs. */
  count: number;
  currencies: readonly CurrencyTotal[];
};

export type TransactionSearchPage = {
  rows: readonly LocalSearchTransaction[];
  nextCursor: TransactionSearchCursor | undefined;
  total: TransactionSearchTotals;
};

/** 50 per page (S10 §5's "50 per page"). Exported so the paging test can size its fixture by it. */
export const SEARCH_PAGE_SIZE = 50;

/**
 * Digits only — the way an amount is matched (§13: "an amount token matches
 * `amount_original` exactly, in any currency"). `48,90` and `48.90` both fold
 * to `4890`, and so does typing `4890` — separators carry no meaning here,
 * only the digits do.
 */
function digitsOf(s: string): string {
  return s.replace(/[^0-9]/g, "");
}

/**
 * Whether `row` matches the folded `needle` — payee, note, or the source
 * leg's amount digits. The amount check only fires when the needle itself has
 * a digit: an empty digit string is a substring of every amount, which would
 * make a purely alphabetic search match every row on the sly.
 */
function matchesText(
  row: { payee: string; note: string; amountDigits: string },
  needle: string,
  needleDigits: string,
): boolean {
  if (fold(row.payee).includes(needle)) return true;
  if (fold(row.note).includes(needle)) return true;
  if (needleDigits !== "" && row.amountDigits.includes(needleDigits)) return true;
  return false;
}

function scopeCondition(scope: TransactionSearchScope) {
  switch (scope) {
    case "all":
      return undefined;
    // `SPEC.md` §6.7: Mine = own accounts, not business. Business = always own.
    // Shared = ownership=shared, never business (constrained against on `accounts`).
    case "mine":
      return and(eq(accounts.ownership, "own"), eq(transactions.isBusiness, false));
    case "business":
      return eq(transactions.isBusiness, true);
    case "shared":
      return eq(accounts.ownership, "shared");
  }
}

/**
 * A page of `search_transactions` (`operations.md`) over the replica — S10.
 *
 * **Structural filters run in SQL; text runs in JS, over what SQL already
 * narrowed.** Trigram search (`computations.md` §13) is Postgres-only —
 * SQLite has no `pg_trgm` and no folded column to `LIKE` against — so a
 * substring match needs `fold()` applied per row, which SQL cannot do. At
 * arc-1 sizes (a personal ledger's few thousand rows, further cut by
 * whichever account/category/scope/date filter is active) reading the
 * structurally-filtered set into JS and folding there is the honest choice:
 * it is exactly right rather than approximately fast, and this phone list is
 * the desk table's first real data point on when that stops being true.
 *
 * **The total is over the whole filtered set, every page** — it is the
 * running total the filter bar promises (S10 §3), not a per-page figure — so
 * it is computed once, before the cursor slices a page off.
 *
 * **A transfer contributes to two currency totals**, one per leg, the same
 * fold `money.ts#accountBalance` uses for a balance: `amount` (already
 * signed "from") into its own currency, `toAmount` (signed "to") into
 * `toCurrency`. Never summed into one figure across currencies (S10 §3: "per
 * currency, never summed across").
 */
export function searchTransactions<TRun, TSchema extends typeof ledgerSchema>(
  db: ReplicaDb<TRun, TSchema>,
  filter: TransactionSearchFilter,
  cursor?: TransactionSearchCursor,
): TransactionSearchPage {
  const toAccounts = alias(accounts, "to_accounts");
  const toCurrencies = alias(currencies, "to_currencies");

  const accountIds = filter.accountIds ?? [];
  const categoryIds = filter.categoryIds ?? [];
  const scope = filter.scope ?? "all";

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
    scopeCondition(scope),
  ];

  const rows = db
    .select({
      id: transactions.id,
      date: transactions.date,
      type: transactions.type,
      payee: transactions.payee,
      note: transactions.note,
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
    })
    .from(transactions)
    .innerJoin(accounts, eq(transactions.accountId, accounts.id))
    .innerJoin(currencies, eq(transactions.currency, currencies.code))
    .leftJoin(toAccounts, eq(transactions.toAccountId, toAccounts.id))
    .leftJoin(toCurrencies, eq(transactions.toCurrency, toCurrencies.code))
    .leftJoin(categories, eq(transactions.categoryId, categories.id))
    .where(and(...conditions.filter((c): c is SQL => c !== undefined)))
    .orderBy(desc(transactions.date), desc(transactions.id))
    .all()
    .map(({ amountOriginal, toAmountRaw, type, ...row }) => ({
      ...row,
      amount: money.signed({ type, amountOriginal, toAmount: toAmountRaw }, "from"),
      toAmount:
        type === "transfer"
          ? money.signed({ type, amountOriginal, toAmount: toAmountRaw }, "to")
          : null,
      type,
      amountDigits: digitsOf(amountOriginal),
    }));

  const needle = filter.text !== undefined ? fold(filter.text.trim()) : "";
  const needleDigits = digitsOf(needle);
  const filtered =
    needle === "" ? rows : rows.filter((row) => matchesText(row, needle, needleDigits));

  const total = totalsOf(filtered);

  const remaining =
    cursor === undefined
      ? filtered
      : filtered.filter(
          (row) => row.date < cursor.date || (row.date === cursor.date && row.id < cursor.id),
        );
  const page = remaining.slice(0, SEARCH_PAGE_SIZE);
  const last = page[page.length - 1];
  const nextCursor =
    remaining.length > SEARCH_PAGE_SIZE && last !== undefined
      ? { date: last.date, id: last.id }
      : undefined;

  return {
    rows: page.map(({ amountDigits, ...row }) => row),
    nextCursor,
    total,
  };
}

type FoldedRow = {
  currency: string;
  decimals: number;
  amount: Money;
  toCurrency: string | null;
  toDecimals: number | null;
  toAmount: Money | null;
  isCapital: boolean;
};

function totalsOf(rows: readonly FoldedRow[]): TransactionSearchTotals {
  const byCurrency = new Map<string, CurrencyTotal>();

  const add = (currency: string, decimals: number, amount: Money, isCapital: boolean) => {
    const running = byCurrency.get(currency) ?? {
      currency: currency as CurrencyCode,
      decimals,
      sum: money.toMoney("0"),
      sumExcludingCapital: money.toMoney("0"),
      capitalCount: 0,
    };
    byCurrency.set(currency, {
      ...running,
      sum: money.add(running.sum, amount),
      sumExcludingCapital: isCapital
        ? running.sumExcludingCapital
        : money.add(running.sumExcludingCapital, amount),
      capitalCount: running.capitalCount + (isCapital ? 1 : 0),
    });
  };

  for (const row of rows) {
    add(row.currency, row.decimals, row.amount, row.isCapital);
    if (row.toCurrency !== null && row.toDecimals !== null && row.toAmount !== null) {
      add(row.toCurrency, row.toDecimals, row.toAmount, row.isCapital);
    }
  }

  return { count: rows.length, currencies: [...byCurrency.values()] };
}
