/**
 * `useLedgerTableSelection` — the shift-click range behind S10 §7 (web):
 * "Shift-click selects a range and multi-select enables `categorize_batch`."
 * `@waltning/core/ledger-table`'s `selectableRange` holds the pure range
 * resolution (inclusive, restricted to selectable rows — H6, round 1); this
 * is only the `useState` wiring around it, so `packages/ui`'s own stories
 * can call the identical function directly instead of keeping a second copy
 * (DESK3 review round 1, M).
 *
 * **Ordinary click toggles one row and moves the anchor; shift-click
 * replaces the selection with the inclusive range between the anchor and
 * the clicked row.** This is Finder's own reading of the gesture, not an
 * additive one — a second shift-click narrows or widens the range from the
 * same anchor rather than accumulating disjoint ranges, which is what keeps
 * "24 selected" answerable by looking at one contiguous block of rows
 * rather than reconstructing a click history.
 *
 * **Rows arrive as a ref, not a dependency.** The range needs the *current*
 * displayed order (sorted, filtered) to resolve two ids into a slice, but
 * a caller re-sorting or re-filtering must not itself select or deselect
 * anything — only a click does that. Reading `rows` through a ref keeps
 * `toggleRow`'s own identity stable and the effect below the only thing
 * that reacts to the row set changing.
 *
 * **A row that falls out of the current set is dropped from the selection.**
 * `categorize_batch` runs `WHERE id IN (…)`, so a stale id costs nothing
 * there — but the visible "n selected" count must equal the rows a person
 * can actually see are selected, not a phantom row a filter just hid.
 */

import { type LedgerSelectableRow, selectableRange } from "@waltning/core/ledger-table";
import { useCallback, useEffect, useRef, useState } from "react";

export type LedgerTableSelection = {
  selectedIds: ReadonlySet<string>;
  isSelected: (id: string) => boolean;
  /** Ordinary click when `rangeExtend` is false; shift-click when it is true. */
  toggleRow: (id: string, rangeExtend: boolean) => void;
  clear: () => void;
  count: number;
};

export function useLedgerTableSelection<Row extends LedgerSelectableRow>(
  rows: readonly Row[],
): LedgerTableSelection {
  const [selectedIds, setSelectedIds] = useState<ReadonlySet<string>>(new Set());
  const [anchorId, setAnchorId] = useState<string | null>(null);

  const rowsRef = useRef(rows);
  rowsRef.current = rows;

  const toggleRow = useCallback(
    (id: string, rangeExtend: boolean) => {
      if (rangeExtend && anchorId !== null) {
        const range = selectableRange(rowsRef.current, anchorId, id);
        if (range !== null) {
          setSelectedIds(new Set(range));
          return;
        }
      }

      setSelectedIds((current) => {
        const next = new Set(current);
        if (next.has(id)) next.delete(id);
        else next.add(id);
        return next;
      });
      setAnchorId(id);
    },
    [anchorId],
  );

  const clear = useCallback(() => {
    setSelectedIds(new Set());
    setAnchorId(null);
  }, []);

  const isSelected = useCallback((id: string) => selectedIds.has(id), [selectedIds]);

  // `rowIdsKey` stands in for the row set's own identity — see the file doc.
  const rowIdsKey = rows.map((row) => row.id).join(",");
  // biome-ignore lint/correctness/useExhaustiveDependencies: rowIdsKey triggers the prune; rowsRef carries the live rows.
  useEffect(() => {
    const live = new Set(rowsRef.current.map((row) => row.id));
    setSelectedIds((current) => {
      let changed = false;
      const next = new Set<string>();
      for (const id of current) {
        if (live.has(id)) next.add(id);
        else changed = true;
      }
      return changed ? next : current;
    });
  }, [rowIdsKey]);

  return { selectedIds, isSelected, toggleRow, clear, count: selectedIds.size };
}
