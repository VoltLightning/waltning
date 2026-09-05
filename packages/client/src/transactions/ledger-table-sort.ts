/**
 * S10 §3/§7 (web) — "sortable by header." Pure sorting over a table's own
 * flat row shape, generic over the row the same way `group-by-day.ts` is
 * generic over `DatedRow`: this lives in `transactions/`, a module
 * `tests/module-boundaries.test.ts` keeps apart from `ledger/`
 * (`create-phone-ledger.ts`'s own home), so the row shape is a structural
 * minimum rather than an import of `PhoneSearchTransaction` across that seam.
 *
 * **`amountValue` is a `Decimal`-backed comparison, never a JS number.**
 * `money.cmp` is `@waltning/core/money`'s own comparator (`dec(a).cmp(b)`) —
 * reusing it here is the whole reason a numeric column can sort exactly
 * without a JS float ever touching a figure (`CLAUDE.md`: "arithmetic only
 * via money.ts").
 *
 * **Third click returns to the natural order.** `use-ledger-table-sort.ts`
 * cycles asc → desc → `null`, and `null` here means "leave the caller's own
 * order alone" — the search page's own newest-first order (S10 §3's running
 * list) rather than a fabricated default column.
 *
 * **Ties break on `id`.** Two rows sharing a date (or an amount) would
 * otherwise sort in whatever order `Array.prototype.sort` feels like on a
 * given engine — stable in V8 today, unspecified by the language — and a
 * table that reorders identical-looking rows between renders reads as
 * broken. Comparing `id` last makes the order a pure function of the data
 * once again.
 */

import * as money from "@waltning/core/money";

export type LedgerTableColumn = "date" | "payee" | "category" | "account" | "scope" | "amount";

export type SortDirection = "asc" | "desc";

/** `null` — the caller's own order, untouched. */
export type SortState = { column: LedgerTableColumn; direction: SortDirection } | null;

/** The minimum a row must carry to be sorted — every field a column reads. */
export type SortableLedgerRow = {
  id: string;
  date: string;
  payee: string;
  category: string;
  account: string;
  scope: string;
  /** A decimal `Money` string — compared via `money.cmp`, never coerced to a number. */
  amountValue: money.Money;
};

const STRING_COLUMN: Record<Exclude<LedgerTableColumn, "amount">, keyof SortableLedgerRow> = {
  date: "date",
  payee: "payee",
  category: "category",
  account: "account",
  scope: "scope",
};

function compareRows<Row extends SortableLedgerRow>(
  a: Row,
  b: Row,
  column: LedgerTableColumn,
): number {
  if (column === "amount") return money.cmp(a.amountValue, b.amountValue);

  const field = STRING_COLUMN[column];
  const left = String(a[field]);
  const right = String(b[field]);
  return left < right ? -1 : left > right ? 1 : 0;
}

/**
 * `rows` is never mutated — `Array.prototype.toSorted` would do the same,
 * but this package's target runtime predates it on some engines this suite
 * still exercises, so the copy is explicit.
 */
export function sortLedgerRows<Row extends SortableLedgerRow>(
  rows: readonly Row[],
  sort: SortState,
): readonly Row[] {
  if (sort === null) return rows;

  const { column, direction } = sort;
  const sign = direction === "asc" ? 1 : -1;

  return [...rows].sort((a, b) => {
    const primary = compareRows(a, b, column);
    if (primary !== 0) return primary * sign;
    // Ties break on `id`, ascending always — a stable order regardless of
    // which direction the sorted column itself is running.
    return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
  });
}
