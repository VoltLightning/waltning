/**
 * `useLedgerTableSort` — the header-click state behind S10 §7 (web)'s
 * "sorting is by column header." `ledger-table-sort.ts` holds the pure
 * comparator; this is only the three-state cycle a click drives.
 *
 * **Asc → desc → natural, never a fourth click back to asc directly.**
 * A header that only ever toggled asc/desc would leave no way back to the
 * list's own order (S10 §3's newest-first) without touching a different
 * column first — landing on `null` is what makes "reset this column" a
 * property of the column itself.
 */

import { useCallback, useState } from "react";
import type { LedgerTableColumn, SortState } from "./ledger-table-sort.ts";

export type UseLedgerTableSortResult = {
  sort: SortState;
  onSortColumn: (column: LedgerTableColumn) => void;
};

export function useLedgerTableSort(initial: SortState = null): UseLedgerTableSortResult {
  const [sort, setSort] = useState<SortState>(initial);

  const onSortColumn = useCallback((column: LedgerTableColumn) => {
    setSort((current) => {
      if (current === null || current.column !== column) return { column, direction: "asc" };
      if (current.direction === "asc") return { column, direction: "desc" };
      return null;
    });
  }, []);

  return { sort, onSortColumn };
}
