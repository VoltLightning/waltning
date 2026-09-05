import { fold } from "@waltning/core/capture/names";
import type { AccountingDate } from "@waltning/core/date";
import { id as brandId, type Id } from "@waltning/core/id";
import type { CurrencyCode, Money } from "@waltning/core/money";
import * as money from "@waltning/core/money";
import type { CounterpartyRole, TxnType } from "@waltning/schema/enums";
import { and, desc, eq, exists, gte, inArray, isNull, lt, lte, or, type SQL } from "drizzle-orm";
import { alias } from "drizzle-orm/sqlite-core";
import type { ReplicaDb } from "../open.ts";
import { ledgerSchema } from "../schema-map.ts";

const { accounts, categories, currencies, transactionLines, transactions } = ledgerSchema;

/** S10 §3 — the four values `SegmentControl` offers, exactly `SPEC.md` §6.7's partition. */
export type TransactionSearchScope = "all" | "mine" | "shared" | "business";

export type TransactionSearchFilter = {
  /** Folded and matched against payee, note, every line's description, and the amount, exactly (§13). */
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

/**
 * A page size, named rather than a bare literal in the query below —
 * `operations.md`/S10 name paging (`search_transactions(filter, page)`) but
 * not a number; 50 is this file's own choice, not a spec-stated figure.
 * Exported so the paging test can size its fixture by it.
 */
export const SEARCH_PAGE_SIZE = 50;

/**
 * Digits, optionally a decimal fraction to `numeric(20,8)`'s eight places,
 * and nothing else — whitespace already stripped as thousands grouping.
 */
const SEARCH_AMOUNT = /^\d+(?:[.,]\d{1,8})?$/;

/**
 * The **whole** query read as an amount, or `null`.
 *
 * §13's rule is that an amount *token* matches `amount_original` exactly, and
 * a search box is a query rather than free text: it names an amount only when
 * there is nothing else in it. Deliberately its own grammar and not
 * `@waltning/core/capture/amount`'s `findAmount`, which answers a different
 * question — quick-add reads the *first number inside* a phrase, on purpose
 * (`"2 coffees 18"` binds to `2`), and it groups thousands in threes, so
 * `"1500"` reads there as `150`. Borrowing it here made a payee-and-year
 * search like `"Shop A 2024"` silently also match every row costing
 * `2 024,00`, and a bare `"1500"` match `150,00`. Two readers because there
 * are two questions; capture's grammar is free to change without moving what
 * a search box means.
 *
 * Space and no-break space are grouping and are dropped; a comma or point is
 * the decimal mark (`money.ts` takes a point), so `"1 500,00"` and `"1500.00"`
 * are the same amount. Compared as money downstream, never as digits: a
 * substring match let `489` find `1 489,00` and fold it into the running
 * total. `489` is not `48,90`; only `48,90` is.
 */
function parseSearchAmount(text: string): Money | null {
  const ungrouped = text.trim().replace(/[ \u00a0]/g, "");
  if (!SEARCH_AMOUNT.test(ungrouped)) return null;
  return money.toMoney(ungrouped.replace(",", "."));
}

/**
 * Whether `row` matches the folded `needle` — payee, note, one of the
 * transaction's own line descriptions, or the source leg's amount
 * **exactly** (§13: "Trigram … over `payee`, `note`, `receipts.merchant` and
 * `transaction_lines.description`" — the phone has no receipts table to
 * search yet, but the lines it holds are exactly this list's fourth column,
 * and H2 found them missing). The amount is read by `parseSearchAmount`
 * above, and compared as money.
 */
function matchesText(
  row: { payee: string; note: string; amountOriginal: Money },
  needle: string,
  needleAmount: Money | null,
  lineDescriptions: readonly string[],
): boolean {
  if (fold(row.payee).includes(needle)) return true;
  if (fold(row.note).includes(needle)) return true;
  if (needleAmount !== null && money.eq(row.amountOriginal, needleAmount)) return true;
  if (lineDescriptions.some((description) => fold(description).includes(needle))) return true;
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
 * **L — `total.count` is `totalRows.length`, not a second SQL `count(*)`.**
 * A standalone aggregate looks cheaper — no `money.signed` fold, no decimal
 * precision needed for a row count — but it buys nothing here: `totalRows`
 * is read and folded in full regardless, for the currency sums beside it
 * (M2's own doc above), so a second query over the same `structuralWhere`
 * was a pure pessimization, one more round trip paying for an answer this
 * function already had. It had also drifted from `totalRows`'s own join
 * set (missing `innerJoin(currencies)`), which an inner join can turn from
 * "redundant" into "silently disagrees with the totals beside it" the
 * moment a row's currency is missing from `currencies`. One query, one join
 * set, one honest count.
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
  // M6 — the whole query must *be* an amount, not merely contain one:
  // `parseSearchAmount("Shop A 2024")` is `null`, where capture's `findAmount`
  // would have read `2024` out of the middle of a payee-and-year search.
  const needleAmount = filter.text === undefined ? null : parseSearchAmount(filter.text);

  const rowsQuery = () =>
    db
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

  // H2 — one query for every matched row's own lines, grouped by transaction.
  // A description lives on `transaction_lines`, not `transactions`, so
  // `rowsQuery()`'s join set (built for display, not for search) never
  // carries it — this is a second, narrow query rather than a wider join
  // that would multiply every multi-line transaction's row.
  //
  // L — the lines are selected by a **correlated subquery over the same
  // `structuralWhere`**, not by `inArray` over the ids just read. The two
  // return the same rows, and the difference is what happens when there are
  // many of them: `rows` is deliberately unbounded here (the text filter
  // cannot be pushed into SQL, so every structurally-matching row is read),
  // so `inArray` binds one SQL parameter per row and SQLite refuses past
  // `SQLITE_MAX_VARIABLE_NUMBER` — "too many SQL variables", thrown at
  // exactly the ledger sizes this list is meant to grow into, and only when
  // a text filter is active. Restating the predicate costs the planner one
  // more pass over an index it has already used and binds nothing.
  const linesByTransaction = new Map<Id<"transactions">, string[]>();
  if (rows.length > 0) {
    const lineRows = db
      .select({
        transactionId: transactionLines.transactionId,
        description: transactionLines.description,
      })
      .from(transactionLines)
      .where(
        exists(
          // The projection is `transactions.id` rather than a raw `sql`1``:
          // `EXISTS` ignores what a subquery selects, and a real column keeps
          // the builder typed where a raw fragment would be `SQL<unknown>`.
          db
            .select({ matched: transactions.id })
            .from(transactions)
            .innerJoin(accounts, eq(transactions.accountId, accounts.id))
            .where(and(eq(transactions.id, transactionLines.transactionId), structuralWhere)),
        ),
      )
      .all();
    for (const line of lineRows) {
      // `transactionLines.transactionId`'s own column type is `Id<IdTable>`
      // — every branded table, not just this one — because the schema
      // declares it `k.uuid("transaction_id")` with no `<Table>` given.
      // Narrowed here, at the boundary, the same way `@waltning/core/id`'s
      // own `id()` is meant to be used.
      const transactionId = brandId<"transactions">(line.transactionId);
      const descriptions = linesByTransaction.get(transactionId);
      if (descriptions) descriptions.push(line.description);
      else linesByTransaction.set(transactionId, [line.description]);
    }
  }

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
