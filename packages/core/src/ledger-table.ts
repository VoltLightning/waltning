/**
 * S10 §3/§7 (web) — the pure algorithms a sortable, range-selectable row
 * table needs: ordering rows by one field, comparing two money figures, and
 * resolving a shift-click range to the selectable rows between two ids.
 *
 * **Lives in `packages/core`, and here is the reason it may.** Nothing in
 * this file names a column, a component, a platform, React or Node — it is
 * rows, a field name and a direction. `packages/client` and `packages/ui`
 * are siblings on the architecture floor (neither may import the other), so
 * a function both of them need has exactly one legal home, and `core` is it
 * (`CLAUDE.md`'s floor diagram: "decimal.js and zod only"). Without that,
 * `packages/ui`'s stories re-implemented the sort by hand and the two
 * snapshots that looked like behavioural proof certified a second copy of
 * the logic. `tests/architecture.test.ts` records this placement in prose
 * beside the rule it is an instance of.
 *
 * **The vocabulary is deliberately smaller than a table's.**
 * `LedgerTableColumn` is *not* here: a column is a rendered thing, it has a
 * header, a width and a label, and it belongs to `packages/ui` with the
 * component that draws it. What crosses the boundary is a **key** — the row
 * field to order on — and `packages/ui` owns the one-line map from its own
 * columns to these keys. That keeps `core` from growing a second opinion
 * about what a ledger table looks like every time a column is added.
 *
 * **`amountValue` is a `Decimal`-backed comparison, never a JS number.**
 * `money.cmp` is `@waltning/core/money`'s own comparator (`dec(a).cmp(b)`) —
 * reusing it here is the whole reason a numeric column can sort exactly
 * without a JS float ever touching a figure (`CLAUDE.md`: "arithmetic only
 * via money.ts").
 *
 * **Money sorts by currency first, then by amount within it** (DESK3 review
 * round 1, H3). `money.cmp` compares two decimal strings, not two figures in
 * two currencies — interleaving 200 EUR and 200 PLN by raw decimal value
 * would read as random the moment a mixed-currency month appears, the same
 * "never converted for comparison" argument `P1` already makes for a single
 * figure. `compareByCurrencyThenAmount` is exported under its own name
 * precisely so a caller can say in its header *which* order it is showing,
 * rather than discovering it.
 *
 * **Third click returns to the natural order.** `cycleSortState` cycles
 * asc → desc → `null`, and `null` means "leave the caller's own order
 * alone" — the search page's own newest-first order (S10 §3's running list)
 * rather than a fabricated default column.
 *
 * **Ties break on `id`.** `Array.prototype.sort` has been *required* to be
 * stable since ES2019, so this is not about the engine: a stable sort
 * preserves the **incoming** order, and the incoming order here is whatever
 * the last filter change or page drain happened to produce. Two rows sharing
 * a date would then swap places whenever the set around them changed, for
 * reasons the reader cannot see. Comparing `id` last makes the displayed
 * order a pure function of the data — the same rows in the same order every
 * time, whatever order they arrived in.
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

export type SortDirection = "asc" | "desc";

/**
 * A sort, or `null` for "the caller's own order, untouched". Generic over
 * the caller's own column vocabulary — `packages/ui` instantiates it with
 * `LedgerTableColumn`, and nothing here needs to know what those are.
 */
export type SortState<Column extends string = string> = {
  column: Column;
  direction: SortDirection;
} | null;

/** The header-click cycle a column's own state runs through: asc → desc → natural. */
export function cycleSortState<Column extends string>(
  current: SortState<Column>,
  column: Column,
): SortState<Column> {
  if (current === null || current.column !== column) return { column, direction: "asc" };
  if (current.direction === "asc") return { column, direction: "desc" };
  return null;
}

/** The two fields a money comparison reads — a figure is meaningless without its unit. */
export type MoneyFields = {
  /** A decimal `Money` string — compared via `money.cmp`, never coerced to a number. */
  amountValue: money.Money;
  currency: string;
};

/**
 * Currency first, amount second — two figures in two currencies are not two
 * points on one axis, and this file's own doc has the rest of the argument.
 * Exported so a header can name the order it is displaying.
 */
export function compareByCurrencyThenAmount(a: MoneyFields, b: MoneyFields): number {
  const byCurrency = compareStrings(a.currency, b.currency);
  return byCurrency !== 0 ? byCurrency : money.cmp(a.amountValue, b.amountValue);
}

/** Every field of `Row` whose value is a string — the fields `sortRows` can order on directly. */
type StringField<Row> = {
  [Key in keyof Row]-?: Row[Key] extends string ? Key : never;
}[keyof Row];

/**
 * What to order on: `"amount"` for the money pair (compared through
 * `compareByCurrencyThenAmount`), or the name of any string field.
 */
export type SortKey<Row> = "amount" | StringField<Row>;

/** The minimum a row must carry to be sorted — an identity, and a figure with its unit. */
export type SortableRow = MoneyFields & { id: string };

function compareStrings(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0;
}

/**
 * `rows` ordered by one field, ascending or descending, ties broken on `id`.
 *
 * `rows` is never mutated — `Array.prototype.toSorted` would do the same,
 * but this package's target runtime predates it on some engines this suite
 * still exercises, so the copy is explicit.
 */
export function sortRows<Row extends SortableRow>(
  rows: readonly Row[],
  key: SortKey<Row>,
  direction: SortDirection,
): readonly Row[] {
  const sign = direction === "asc" ? 1 : -1;

  return [...rows].sort((a, b) => {
    const primary =
      key === "amount"
        ? compareByCurrencyThenAmount(a, b)
        : compareStrings(fieldOf(a, key), fieldOf(b, key));
    if (primary !== 0) return primary * sign;
    // Ties break on `id`, ascending always — a stable order regardless of
    // which direction the sorted column itself is running.
    return compareStrings(a.id, b.id);
  });
}

/**
 * `row[key]` as a string. `String()` rather than a cast: `StringField<Row>`
 * already proves the field is a string to TypeScript, and a runtime that
 * disagrees (a row built from JSON off the wire) should compare *something*
 * rather than throw inside a comparator.
 */
function fieldOf<Row>(row: Row, key: keyof Row): string {
  const value = row[key];
  return typeof value === "string" ? value : String(value);
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
