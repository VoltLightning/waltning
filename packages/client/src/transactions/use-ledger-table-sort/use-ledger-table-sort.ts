/**
 * `useLedgerTableSort` — the header-click state behind S10 §7 (web)'s
 * "sorting is by column header." `@waltning/core/ledger-table`'s
 * `cycleSortState` holds the pure three-state cycle (asc → desc → natural);
 * this is only the `useState` wiring around it, so `packages/ui`'s own
 * stories can call the identical function directly instead of keeping a
 * second copy (DESK3 review round 1, M).
 *
 * **Generic over the caller's own columns.** A column is a rendered thing —
 * it has a header, a width and a label — and it belongs to `packages/ui`
 * with the component that draws it, which this package may not import. So
 * the column vocabulary arrives as a type parameter and the hook never names
 * one: `useLedgerTableSort<LedgerTableColumn>()` at the call site, and the
 * sort state that comes back is typed in the caller's own terms.
 */

import { cycleSortState, type SortState } from "@waltning/core/ledger-table";
import { useCallback, useMemo, useState } from "react";

export type UseLedgerTableSortResult<Column extends string> = {
  sort: SortState<Column>;
  onSortColumn: (column: Column) => void;
};

export function useLedgerTableSort<Column extends string>(
  initial: SortState<Column> = null,
): UseLedgerTableSortResult<Column> {
  const [sort, setSort] = useState<SortState<Column>>(initial);

  const onSortColumn = useCallback((column: Column) => {
    setSort((current) => cycleSortState(current, column));
  }, []);

  // One object per state change, not per render — a consumer that lists this
  // result in a dependency array (`<LedgerTable>`'s own `renderItem`) would
  // otherwise re-derive on every parent render (L, round 2).
  return useMemo(() => ({ sort, onSortColumn }), [sort, onSortColumn]);
}
