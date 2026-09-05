/**
 * S10 §4 — "each filter reports the count it excludes."
 *
 * The filter bar's own job is not only to *be* a filter but to say what it
 * costs: a rail with `Bank A · PLN` and `Groceries` both set hides a number
 * of rows that no control on screen names, and a reader wondering where a
 * transaction went has to clear filters one at a time to find out.
 * `05-composites.md` §5.6 asks the same of the phone's chip row, so both
 * surfaces read this hook.
 *
 * **One count per active control, and the arithmetic is a subtraction.**
 * There is no reader on the port that answers "how many rows would come back
 * without this one clause" — `search_transactions` is the only count there
 * is, and its total is already unpaged (`search-transactions.ts`: "the total
 * is over the whole filtered set, every page"). So each active dimension
 * runs the same search once with itself emptied and subtracts the count the
 * screen is already showing. An inactive dimension excludes nothing by
 * definition and costs no query at all.
 *
 * **It is not cheap and it is not pretending to be.** Each of those counts
 * reads and folds every structurally-matching row (the same trade
 * `searchTransactions`' own doc names — SQLite cannot sum decimal money and
 * cannot fold text). Six active controls is six reads over a personal
 * ledger's few thousand rows, keyed on the filter's serialised shape so a
 * re-render costs nothing and only an actual filter change pays again. The
 * cheaper shape — one query returning every dimension's count at once —
 * would be a new port operation, and `operations.md` is where that decision
 * belongs, not here.
 *
 * **The `applied` filter, never the typed one.** `text` reaches the query
 * 250 ms after the keystroke (`use-debounced-value.ts`), and a count derived
 * from a text the search has not run yet would describe a set nobody is
 * looking at — the numbers would flicker against rows that had not moved.
 *
 * **In an effect, not in a `useMemo`.** These are secondary numbers about a
 * result the screen is already showing, and running them during render would
 * put them *ahead* of the search they annotate — the port would be asked
 * "how many without the account filter" before it had been asked for the
 * rows at all. An effect also keeps a render React may discard from reaching
 * the database. The first paint therefore carries no notes; they arrive on
 * the commit after, which is the right order for a caption.
 */

import { useEffect, useState } from "react";
import type { PhoneLedgerController } from "./create-phone-ledger.ts";
import { type LedgerFilterState, ledgerFilterDraft } from "./use-ledger-filters.ts";

/**
 * One filter control's worth of state. `dateRange` is one dimension because
 * `from` and `to` are one control on both surfaces — a chip on the phone, a
 * stepper plus two fields in the rail — and clearing half a range is not a
 * thing either offers.
 */
export type LedgerFilterDimension =
  | "text"
  | "accountIds"
  | "categoryIds"
  | "scope"
  | "currency"
  | "counterpartyId"
  | "dateRange";

/** How many extra rows each active control is keeping off screen. Absent = the control is not active. */
export type FilterExclusionCounts = Partial<Record<LedgerFilterDimension, number>>;

/** The filter with one dimension returned to its "everything" value. */
function without(filter: LedgerFilterState, dimension: LedgerFilterDimension): LedgerFilterState {
  switch (dimension) {
    case "text":
      return { ...filter, text: "" };
    case "accountIds":
      return { ...filter, accountIds: [] };
    case "categoryIds":
      return { ...filter, categoryIds: [] };
    case "scope":
      return { ...filter, scope: "all" };
    case "currency":
      return { ...filter, currency: "" };
    case "counterpartyId":
      return { ...filter, counterpartyId: "" };
    case "dateRange":
      return { ...filter, from: "", to: "" };
  }
}

/** Which controls currently narrow anything — the only ones worth a query. */
export function activeFilterDimensions(
  filter: LedgerFilterState,
): readonly LedgerFilterDimension[] {
  const active: LedgerFilterDimension[] = [];
  if (filter.text.trim() !== "") active.push("text");
  if (filter.accountIds.length > 0) active.push("accountIds");
  if (filter.categoryIds.length > 0) active.push("categoryIds");
  if (filter.scope !== "all") active.push("scope");
  if (filter.currency !== "") active.push("currency");
  if (filter.counterpartyId !== "") active.push("counterpartyId");
  if (filter.from !== "" || filter.to !== "") active.push("dateRange");
  return active;
}

export function useFilterExclusionCounts(
  controller: PhoneLedgerController,
  /** The filter the rows on screen answer to — `useLedgerFilters`' `applied`. */
  applied: LedgerFilterState,
  /** `search.total.count` — already on screen, so it is not queried a second time. */
  matchedCount: number,
): FilterExclusionCounts {
  const [counts, setCounts] = useState<FilterExclusionCounts>({});

  // The filter's serialised *shape*, not its identity — the same trigger
  // `use-transaction-search.ts` uses, and for the same reason: a caller
  // rebuilding the object every render must not re-run six searches.
  const appliedKey = JSON.stringify(applied);

  // `applied` is read through `appliedKey`, which is what changes when its
  // shape does; listing the object itself would re-run six searches on every
  // render a caller happened to rebuild it in.
  // biome-ignore lint/correctness/useExhaustiveDependencies: appliedKey stands in for applied's shape
  useEffect(() => {
    const next: FilterExclusionCounts = {};
    for (const dimension of activeFilterDimensions(applied)) {
      const wider = controller.searchTransactions(ledgerFilterDraft(without(applied, dimension)))
        .total.count;
      // `Math.max` rather than a bare subtraction: a write landing between
      // the screen's own search and these is the one way the wider count can
      // come back smaller, and "excludes −3" is worse than "excludes 0".
      next[dimension] = Math.max(0, wider - matchedCount);
    }
    setCounts(next);
  }, [controller, appliedKey, matchedCount]);

  return counts;
}
