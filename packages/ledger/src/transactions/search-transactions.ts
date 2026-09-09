import { fold } from "@waltning/core/capture/names";
import type { AccountingDate } from "@waltning/core/date";
import type { Id } from "@waltning/core/id";
import type { CurrencyCode, Money, PivotPerUnit } from "@waltning/core/money";
import * as money from "@waltning/core/money";
import type { CounterpartyRole, TxnType } from "@waltning/schema/enums";
import { and, count, desc, eq, lt, or } from "drizzle-orm";
import { alias } from "drizzle-orm/sqlite-core";
import type { ReplicaDb } from "../open.ts";
import { ledgerSchema } from "../schema-map.ts";
import { lineDescriptionsBy, matchesText, parseSearchAmount } from "./text-match.ts";
import {
  ledgerRowsQuery,
  signRow,
  structuralWhere as structuralWhereFor,
} from "./transaction-query.ts";

const { accounts, currencies, transactions } = ledgerSchema;

/** S10 §3 — the four values `SegmentControl` offers, exactly `SPEC.md` §6.7's partition. */
export type TransactionSearchScope = "all" | "mine" | "shared" | "business";

export type TransactionSearchFilter = {
  /** Folded and matched against payee, note, every line's description, and the amount, exactly (§13). */
  text?: string;
  /** Matches either leg — a transfer touching a filtered account still shows. */
  accountIds?: readonly Id<"accounts">[];
  categoryIds?: readonly Id<"categories">[];
  scope?: TransactionSearchScope;
  /** Matches either leg, the same reasoning `accountIds` already gives (§4 web rail — DESK3 round 1, M). */
  currency?: CurrencyCode;
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
  /** `SPEC.md` §14.4b — see `readRecent`'s identical field (S10). */
  brandKey: string | null;
  categoryName: string | null;
  accountId: Id<"accounts">;
  accountName: string;
  /** Present only on a transfer (`toAccountId` is the schema's own transfer marker). */
  toAccountId: Id<"accounts"> | null;
  toAccountName: string | null;
  /** Already signed, the "from" leg — `money.ts#signed`. */
  amount: Money;
  /** Pivot per unit of `currency`, for this row's own accounting date (P1). */
  fxRate: PivotPerUnit;
  fxRateEstimated: boolean;
  currency: CurrencyCode;
  decimals: number;
  /** Already signed, the "to" leg. `null` off a transfer. */
  toAmount: Money | null;
  /** The destination leg's rate — `null` where the ledger could not price it. */
  toFxRate: PivotPerUnit | null;
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

/**
 * A page size, named rather than a bare literal in the query below —
 * `operations.md`/S10 name paging (`search_transactions(filter, page)`) but
 * not a number; 50 is this file's own choice, not a spec-stated figure.
 * Exported so the paging test can size its fixture by it.
 */
export const SEARCH_PAGE_SIZE = 50;

/**
 * How the caller wants the operation answered — the filter says *what* to
 * match, this says *how much of the answer is wanted*.
 *
 * **`countOnly` is the whole reason this type exists.** S10 §4's "each
 * filter reports the count it excludes" asks one question per active control
 * — "how many rows would match without this one clause" — and the only thing
 * it reads off the answer is `total.count`. Answering that through the full
 * operation made every one of those a *fold*: `signRow` per row through
 * `decimal.js`, `totalsOf` accumulating currency sums nobody renders, over a
 * set deliberately *wider* than the one on screen. The `dateRange` control is
 * the worst of them by construction — the query that drops the date range is
 * a query over the whole ledger, and on the desk branch that ran on every
 * mount.
 *
 * In count-only mode the reader answers the same question with an SQL
 * `COUNT(*)` over the same `WHERE` and the same join set, and hands back no
 * rows and no currency totals at all. That is not a cheaper approximation of
 * the same figure — it is the identical figure, because `total.count` was
 * only ever `totalRows.length` and the joins that decide it are unchanged.
 */
export type TransactionSearchOptions = {
  /**
   * Answer with `total.count` and nothing else: no page, no cursor, no
   * currency sums. `rows` comes back empty and `total.currencies` empty —
   * a caller wanting either must not ask for a count.
   */
  countOnly?: boolean;
};

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
 * **M2 — the page is bounded; the total is not, and cannot be made an SQL
 * aggregate without breaking `money.ts`'s own rule.** A text-free search
 * pushes its `LIMIT` into SQL (`(date, id)` keyset order plus the cursor
 * decide which `SEARCH_PAGE_SIZE + 1` rows the page needs, and nothing more)
 * — but the total beside it still runs its own query with no `LIMIT` at all,
 * reading and folding *every* structurally-matching row, over a leaner column
 * set with no `accounts`/`toAccounts`/`categories` join the page needs but a
 * sum does not. This is not an oversight: `money.signed` per row (income vs.
 * expense vs. a transfer's two legs, §7.2) is not expressible in SQL, and
 * SQLite has no genuine decimal type — its `SUM()` coerces the `TEXT` this
 * replica stores money as into a `REAL`, handing this file back a JS
 * `number` holding an amount, which `architecture/11` calls a bug regardless
 * of where it happens. Folding every matching row through `decimal.js` in
 * JS is the one way to keep the exact 8dp sum the six-currency-total tests
 * assert on, at arc-1 sizes (a personal ledger's few thousand rows, further
 * cut by whichever structural filter is active) the same trade-off the
 * `text`-search branch below makes for the same reason. A `text` filter
 * still reads the whole structurally-filtered set into JS first regardless —
 * the trade-off `matchesText`'s own doc names above, unavoidable without
 * `pg_trgm`.
 *
 * **L — `total.count` is `totalRows.length` whenever the currency sums are
 * being asked for anyway, and an SQL `COUNT(*)` when they are not.** For a
 * full answer a standalone aggregate buys nothing: `totalRows` is read and
 * folded in full regardless, for the currency sums beside it (M2's own doc
 * above), so a second query over the same `structuralWhere` would be one
 * more round trip paying for an answer this function already had — and an
 * earlier one had drifted from `totalRows`'s own join set (missing
 * `innerJoin(currencies)`), which an inner join turns from "redundant" into
 * "silently disagrees with the totals beside it" the moment a row's currency
 * is missing from `currencies`. What changed that reasoning is a caller that
 * wants *only* the count (`TransactionSearchOptions#countOnly`): there the
 * fold has nothing to pay for, so the aggregate runs over the same
 * `structuralWhere` and the same two inner joins — one query, one join set,
 * one honest count, either way.
 */
export function searchTransactions<TRun, TSchema extends typeof ledgerSchema>(
  db: ReplicaDb<TRun, TSchema>,
  filter: TransactionSearchFilter,
  cursor?: TransactionSearchCursor,
  options?: TransactionSearchOptions,
): TransactionSearchPage {
  const toCurrencies = alias(currencies, "to_currencies");

  const structuralWhere = structuralWhereFor(filter);

  const needle = filter.text !== undefined ? fold(filter.text.trim()) : "";
  // M6 — the whole query must *be* an amount, not merely contain one:
  // `parseSearchAmount("Shop A 2024")` is `null`, where capture's `findAmount`
  // would have read `2024` out of the middle of a payee-and-year search.
  const needleAmount = filter.text === undefined ? null : parseSearchAmount(filter.text);

  if (options?.countOnly === true) {
    // The same two inner joins the totals use, and no others — the join set
    // is what decides which rows exist to be counted, so a count taken over
    // a different one would silently disagree with the figure it is
    // subtracted from. The left joins the page needs (`to_accounts`,
    // `to_currencies`, `categories`) cannot change a row count, and drawing
    // them here would only make that harder to see.
    const countable = db
      .select({ matched: count() })
      .from(transactions)
      .innerJoin(accounts, eq(transactions.accountId, accounts.id))
      .innerJoin(currencies, eq(transactions.currency, currencies.code));

    if (needle === "") {
      const [row] = countable.where(structuralWhere).all();
      return {
        rows: [],
        nextCursor: undefined,
        total: { count: row?.matched ?? 0, currencies: [] },
      };
    }

    // A `text` filter still cannot be decided in SQL (`matchesText`'s own
    // doc) — every structurally-matching row is read and folded by *name*,
    // its line descriptions included (H2), because a count that read three
    // of the four columns would not be the figure it is subtracted from.
    // What count-only drops even here is the money fold: the text columns
    // instead of the whole row, `signRow` never called, `totalsOf` never
    // called.
    const candidates = db
      .select({
        id: transactions.id,
        payee: transactions.payee,
        note: transactions.note,
        amountOriginal: transactions.amountOriginal,
      })
      .from(transactions)
      .innerJoin(accounts, eq(transactions.accountId, accounts.id))
      .innerJoin(currencies, eq(transactions.currency, currencies.code))
      .where(structuralWhere)
      .all();
    const countLines =
      candidates.length > 0
        ? lineDescriptionsBy(db, structuralWhere)
        : new Map<Id<"transactions">, string[]>();
    const matched = candidates.filter((row) =>
      matchesText(row, needle, needleAmount, countLines.get(row.id) ?? []),
    );
    return { rows: [], nextCursor: undefined, total: { count: matched.length, currencies: [] } };
  }

  const rowsQuery = () => ledgerRowsQuery(db);

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
    // `categories.name`) the page above needs and a sum does not. M2 —
    // deliberately no `.limit()` here: unlike the page, the total is bounded
    // only by how many rows the filter matches, never a fixed page size (see
    // this function's own doc for why an SQL-side sum is not the fix).
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

  // H2 — the line descriptions `matchesText` also reads, for the same
  // structurally-filtered set (`lineDescriptionsBy` above). Skipped entirely
  // when nothing matched structurally: there is no row to attach one to.
  const linesByTransaction =
    rows.length > 0
      ? lineDescriptionsBy(db, structuralWhere)
      : new Map<Id<"transactions">, string[]>();

  const filtered = rows.filter((row) =>
    matchesText(row, needle, needleAmount, linesByTransaction.get(row.id) ?? []),
  );
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

/** One day of the period, and how many rows in it matched. */
export type MatchDay = { date: AccountingDate; count: number };

/**
 * §7's match counts, cut by day — what Calendar and Months draw while the
 * screen is searching.
 *
 * **In this file, sharing this file's matcher.** §13's text rule cannot be
 * pushed into SQL (`matchesText`'s own doc), so a count taken anywhere else
 * would be a *second* reading of what a search means — and the two would
 * disagree the first time §13 changed. The candidate query, `fold`,
 * `parseSearchAmount`, `lineDescriptionsBy` and `matchesText` are the same
 * ones `searchTransactions` uses, four lines above.
 *
 * **A period, not a page.** The same reason `readDayFlows` gives: a calendar
 * cannot be paged, and a grid whose 30th day was missing because the page ended
 * at 29 is a silently wrong picture rather than a short list.
 *
 * **Days with no match are absent, not zero.** A caller draws a grid or twelve
 * rows and knows which days it wants; a read that invented an entry per empty
 * day would be returning the calendar's own shape back to it.
 */
export function readMatchDays<TRun, TSchema extends typeof ledgerSchema>(
  db: ReplicaDb<TRun, TSchema>,
  period: money.Period,
  text: string,
): readonly MatchDay[] {
  const needle = fold(text.trim());
  if (needle === "") return [];
  const needleAmount = parseSearchAmount(text);

  /**
   * **The period's end is exclusive; `structuralWhere`'s `to` is inclusive.**
   * `money.Period` is half-open — `readDayFlows` bounds itself with
   * `lt(date, end)` — and handing `end` straight to a filter that compares with
   * `lte` puts the first day of the *next* month into this month's grid. Caught
   * by a test that inserted a row on 1 October and found it counted in
   * September.
   *
   * Bounded here rather than by shifting the date: a date subtraction would be
   * arithmetic on an accounting date, which this project does not do, and the
   * predicate is the thing that was wrong.
   */
  const structuralWhere = and(
    structuralWhereFor({ from: period.start }),
    lt(transactions.date, period.end),
  );
  const candidates = db
    .select({
      id: transactions.id,
      date: transactions.date,
      payee: transactions.payee,
      note: transactions.note,
      amountOriginal: transactions.amountOriginal,
    })
    .from(transactions)
    .innerJoin(accounts, eq(transactions.accountId, accounts.id))
    .innerJoin(currencies, eq(transactions.currency, currencies.code))
    .where(structuralWhere)
    .all();

  const lines =
    candidates.length > 0
      ? lineDescriptionsBy(db, structuralWhere)
      : new Map<Id<"transactions">, string[]>();

  const byDay = new Map<AccountingDate, number>();
  for (const row of candidates) {
    if (!matchesText(row, needle, needleAmount, lines.get(row.id) ?? [])) continue;
    byDay.set(row.date, (byDay.get(row.date) ?? 0) + 1);
  }
  return [...byDay].map(([date, count]) => ({ date, count }));
}
