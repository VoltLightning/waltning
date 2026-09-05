/**
 * `useLedgerTableSort` — the header-click state behind S10 §7 (web)'s
 * "sorting is by column header." `@waltning/core/ledger-table`'s
 * `cycleSortState` holds the pure three-state cycle (asc → desc → natural);
 * this is only the `useState` wiring around it, so `packages/ui`'s own
 * stories can call the identical function directly instead of keeping a
 * second copy (DESK3 review round 1, M).
 */

import {
  cycleSortState,
  type LedgerTableColumn,
  type SortState,
} from "@waltning/core/ledger-table";
import { useCallback, useState } from "react";

export type UseLedgerTableSortResult = {
  sort: SortState;
  onSortColumn: (column: LedgerTableColumn) => void;
};

export function useLedgerTableSort(initial: SortState = null): UseLedgerTableSortResult {
  const [sort, setSort] = useState<SortState>(initial);

  const onSortColumn = useCallback((column: LedgerTableColumn) => {
    setSort((current) => cycleSortState(current, column));
  }, []);

  return { sort, onSortColumn };
}
