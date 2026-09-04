import { findAmount } from "@waltning/core/capture/amount";
import { fold } from "@waltning/core/capture/names";
import type { AccountingDate } from "@waltning/core/date";
import type { Id } from "@waltning/core/id";
import type { CurrencyCode, Money } from "@waltning/core/money";
import * as money from "@waltning/core/money";
import type { CounterpartyRole, TxnType } from "@waltning/schema/enums";
import { and, desc, eq, gte, inArray, isNull, lt, lte, or, type SQL } from "drizzle-orm";
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
  /** S13's whole history — every row naming this counterparty, any role. */
  counterpartyId?: Id<"counterparties">;
  /** S13 §3's default toggle — `debt` only until "· N other rows" is opened. */
  counterpartyRole?: CounterpartyRole;
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
  /** `null` off any row with no counterparty at all — the ordinary case. */
  counterpartyRole: CounterpartyRole | null;
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
 * Whether `row` matches the folded `needle` — payee, note, or the source
 * leg's amount **exactly** (§13: "an amount token matches `amount_original`
 * exactly, in any currency"). The token is read the way capture reads one
 * (`findAmount` — `48,90` and `48.90` are the same value), and compared as
 * money, never as digits: a substring match let `489` find `1 489,00` and
 * put it in the running total. `489` is not `48,90`; only `48,90` is.
 */
function matchesText(
  row: { payee: string; note: string; amountOriginal: Money },
  needle: string,
  needleAmount: Money | null,
): boolean {
  if (fold(row.payee).includes(needle)) return true;
  if (fold(row.note).includes(needle)) return true;
  if (needleAmount !== null && money.eq(row.amountOriginal, needleAmount)) return true;
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
 *
 * **M2 — a text-free search pushes its `LIMIT` into SQL; a text search
 * cannot.** Every keystroke into a filter with no `text` (S13's whole
 * history, the settle sheet blurring a discharge candidate) used to run this
 * query with no `LIMIT` at all — reading and joining every structurally-
 * matching row, then slicing a 50-row page off in JS — regardless of how
 * many rows actually matched. With no `text` to fold, SQL alone can already
 * decide which rows the page needs (`(date, id)` keyset order plus the
 * cursor), so that path asks for `SEARCH_PAGE_SIZE + 1` rows and nothing
 * more; totals still need every matching row summed (`money.signed` per row
 * is not expressible in SQL), so that runs as its own query, over a leaner
 * column set with no `accounts`/`toAccounts`/`categories` join the page's own
 * display needs but a sum does not. A `text` filter still reads the whole
 * structurally-filtered set into JS first — the trade-off `matchesText`'s own
 * doc names above, unavoidable without `pg_trgm`.
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

  const structuralConditions: (SQL | undefined)[] = [
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
    filter.counterpartyId !== undefined
      ? eq(transactions.counterpartyId, filter.counterpartyId)
      : undefined,
    filter.counterpartyRole !== undefined
      ? eq(transactions.counterpartyRole, filter.counterpartyRole)
      : undefined,
  ];
  const structuralWhere = and(...structuralConditions.filter((c): c is SQL => c !== undefined));

  const needle = filter.text !== undefined ? fold(filter.text.trim()) : "";
  const needleAmount = filter.text === undefined ? null : (findAmount(filter.text)?.amount ?? null);

  const rowsQuery = () =>
    db
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
        counterpartyRole: transactions.counterpartyRole,
      })
      .from(transactions)
      .innerJoin(accounts, eq(transactions.accountId, accounts.id))
      .innerJoin(currencies, eq(transactions.currency, currencies.code))
      .leftJoin(toAccounts, eq(transactions.toAccountId, toAccounts.id))
      .leftJoin(toCurrencies, eq(transactions.toCurrency, toCurrencies.code))
      .leftJoin(categories, eq(transactions.categoryId, categories.id));

  const signRow = <
    Row extends { amountOriginal: Money; toAmountRaw: Money | null; type: TxnType },
  >({
    amountOriginal,
    toAmountRaw,
    type,
    ...row
  }: Row) => ({
    ...row,
    amount: money.signed({ type, amountOriginal, toAmount: toAmountRaw }, "from"),
    toAmount:
      type === "transfer"
        ? money.signed({ type, amountOriginal, toAmount: toAmountRaw }, "to")
        : null,
    type,
    amountOriginal,
  });

  if (needle === "") {
    const cursorCondition =
      cursor !== undefined
        ? or(
            lt(transactions.date, cursor.date),
            and(eq(transactions.date, cursor.date), lt(transactions.id, cursor.id)),
          )
        : undefined;

    const pageRows = rowsQuery()
      .where(
        cursorCondition !== undefined ? and(structuralWhere, cursorCondition) : structuralWhere,
      )
      .orderBy(desc(transactions.date), desc(transactions.id))
      .limit(SEARCH_PAGE_SIZE + 1)
      .all()
      .map(signRow);

    const page = pageRows.slice(0, SEARCH_PAGE_SIZE);
    const last = page[page.length - 1];
    const nextCursor =
      pageRows.length > SEARCH_PAGE_SIZE && last !== undefined
        ? { date: last.date, id: last.id }
        : undefined;

    // A leaner query for the total — every matching row, but none of the
    // display-only joins (`accounts.name`, `toAccounts.name`,
    // `categories.name`) the page above needs and a sum does not.
    const totalRows = db
      .select({
        currency: transactions.currency,
        decimals: currencies.decimals,
        amountOriginal: transactions.amountOriginal,
        toAmountRaw: transactions.toAmount,
        toCurrency: transactions.toCurrency,
        toDecimals: toCurrencies.decimals,
        type: transactions.type,
        isCapital: transactions.isCapital,
      })
      .from(transactions)
      .innerJoin(accounts, eq(transactions.accountId, accounts.id))
      .innerJoin(currencies, eq(transactions.currency, currencies.code))
      .leftJoin(toCurrencies, eq(transactions.toCurrency, toCurrencies.code))
      .where(structuralWhere)
      .all()
      .map(signRow);

    return {
      rows: page.map(({ amountOriginal, ...row }) => row),
      nextCursor,
      total: totalsOf(totalRows),
    };
  }

  // A `text` filter cannot be decided in SQL (`matchesText`'s own doc above)
  // — every structurally-matching row is read once, folded, filtered, then
  // paged and totalled in JS, same as before this fix.
  const rows = rowsQuery()
    .where(structuralWhere)
    .orderBy(desc(transactions.date), desc(transactions.id))
    .all()
    .map(signRow);

  const filtered = rows.filter((row) => matchesText(row, needle, needleAmount));
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
    rows: page.map(({ amountOriginal, ...row }) => row),
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
