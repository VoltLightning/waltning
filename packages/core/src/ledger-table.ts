/**
 * S10 §3/§7 (web) — the desk ledger table's pure algorithms: sorting a flat
 * row list by column header, and resolving a shift-click range to the
 * selectable rows between two ids.
 *
 * **Lives in `packages/core`, not `packages/client`.** DESK3 review round 1
 * (M): `packages/ui`'s own stories were re-implementing this logic by hand,
 * in `useState`, because `packages/client` and `packages/ui` are siblings on
 * the architecture floor — neither may import the other — and the real
 * implementation lived in `client`. Neither algorithm here touches React,
 * a platform, or Node (`core`'s own charter, `CLAUDE.md`'s floor diagram:
 * "decimal.js and zod only"), so moving the *pure* half down to `core` — the
 * one package both `client` and `ui` already depend on — is a placement fix,
 * not a new abstraction: `packages/client/src/transactions/use-ledger-table-
 * sort.ts` and `use-ledger-table-selection.ts` still own the `useState`
 * wiring around these functions, and now so does `packages/ui`'s own stories
 * file, calling the same functions directly instead of a second copy.
 *
 * **`amountValue` is a `Decimal`-backed comparison, never a JS number.**
 * `money.cmp` is `@waltning/core/money`'s own comparator (`dec(a).cmp(b)`) —
 * reusing it here is the whole reason a numeric column can sort exactly
 * without a JS float ever touching a figure (`CLAUDE.md`: "arithmetic only
 * via money.ts").
 *
 * **Amount sorts by currency first, then by amount within it** (DESK3 review
 * round 1, H3). `money.cmp` compares two decimal strings, not two figures in
 * two currencies — interleaving 200 EUR and 200 PLN by raw decimal value
 * would read as random the moment a mixed-currency month appears, the same
 * "never converted for comparison" argument `P1` already makes for a single
 * figure. The header's own sort indicator says "by currency, then amount"
 * while this column is active, so the grouping is stated rather than
 * discovered.
 *
 * **Third click returns to the natural order.** `cycleSortState` cycles
 * asc → desc → `null`, and `null` means "leave the caller's own order
 * alone" — the search page's own newest-first order (S10 §3's running list)
 * rather than a fabricated default column.
 *
 * **Ties break on `id`.** Two rows sharing a date (or an amount, or a
 * currency) would otherwise sort in whatever order `Array.prototype.sort`
 * feels like on a given engine — stable in V8 today, unspecified by the
 * language — and a table that reorders identical-looking rows between
 * renders reads as broken. Comparing `id` last makes the order a pure
 * function of the data once again.
 *
 * **Shift-click selects the inclusive range, restricted to selectable
 * rows.** H6 (round 1): a range spanning a transfer or an adjustment must
 * not silently select it too — those rows carry no checkbox at all, so a
 * count that included them would disagree with what is visibly checked.
 * `selectableRange` filters to `row.selectable` *before* resolving the two
 * ids to a slice, which is what makes an intervening non-selectable row
 * transparent to the range rather than an obstacle to route around.
 */

import * as money from "./money.ts";

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
  currency: string;
};

const STRING_COLUMN: Record<Exclude<LedgerTableColumn, "amount">, keyof SortableLedgerRow> = {
  date: "date",
  payee: "payee",
  category: "category",
  account: "account",
  scope: "scope",
};

function compareStrings(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0;
}

function compareRows<Row extends SortableLedgerRow>(
  a: Row,
  b: Row,
  column: LedgerTableColumn,
): number {
  if (column === "amount") {
    // Currency first, amount second — `sortLedgerRows`'s own `sign`
    // multiplies whichever of the two this returns, so asc/desc reverses
    // both together, the same as any other two-key sort would.
    const byCurrency = compareStrings(a.currency, b.currency);
    return byCurrency !== 0 ? byCurrency : money.cmp(a.amountValue, b.amountValue);
  }

  const field = STRING_COLUMN[column];
  return compareStrings(String(a[field]), String(b[field]));
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

/** The header-click cycle a column's own state runs through: asc → desc → natural. */
export function cycleSortState(current: SortState, column: LedgerTableColumn): SortState {
  if (current === null || current.column !== column) return { column, direction: "asc" };
  if (current.direction === "asc") return { column, direction: "desc" };
  return null;
}

export type LedgerSelectableRow = { id: string; selectable: boolean };

/**
 * The inclusive range between `anchorId` and `targetId`, in `rows`' own
 * order, restricted to rows with `selectable: true` — a non-selectable row
 * between them (a transfer, an adjustment) is skipped rather than
 * terminating or breaking the range. Returns `null` when either id is not
 * found among the selectable rows, which the caller reads as "fall back to
 * an ordinary click" rather than a range with an undefined end.
 */
export function selectableRange<Row extends LedgerSelectableRow>(
  rows: readonly Row[],
  anchorId: string,
  targetId: string,
): readonly string[] | null {
  const ids = rows.filter((row) => row.selectable).map((row) => row.id);
  const anchorIndex = ids.indexOf(anchorId);
  const targetIndex = ids.indexOf(targetId);
  if (anchorIndex === -1 || targetIndex === -1) return null;
  const [start, end] =
    anchorIndex <= targetIndex ? [anchorIndex, targetIndex] : [targetIndex, anchorIndex];
  return ids.slice(start, end + 1);
}
