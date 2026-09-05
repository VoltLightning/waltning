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
 * without this one clause" in a single query, so each active dimension runs
 * `search_transactions` once with itself emptied and subtracts the count the
 * screen is already showing. An inactive dimension excludes nothing by
 * definition and costs no query at all.
 *
 * **Every one of those queries is `countOnly`** (M3, round 3). The only
 * thing read off the answer is `total.count`, and the port answers a
 * count-only call with an SQL `COUNT(*)` over the same `WHERE` — no page, no
 * `money.signed` per row, no currency sums folded through `decimal.js` for
 * figures nothing renders. It matters most for the one dimension that is
 * unbounded by construction: the query behind the date range's own note is a
 * query with *no* date range, i.e. over the whole ledger, and on the desk
 * branch that runs on the first paint of every mount. A bounded `COUNT` over
 * the whole ledger is a different thing from folding it.
 *
 * A `text` filter is still read row by row on its own dimension's query —
 * `searchTransactions`' own doc has why (no `pg_trgm`, no folded column) —
 * but even there count-only reads three text columns instead of the row and
 * folds no money.
 *
 * **The subtrahend has to come from the same run as the counts** (M2, round
 * 3). `total.count` describes whichever filter the search last *answered*,
 * and for one commit after a filter change that is the previous one — the
 * screen re-renders with the new filter before the effect that re-queries
 * has run. Subtracting a stale count published a wrong number ("Excludes 11
 * rows" for one commit, then 10) and paid a full round of queries to
 * produce it. So the counts run only when the search's own `answersTo` is
 * the filter these are computed from: exactly one round of queries per
 * filter change, and never a subtraction across two different filters.
 * While they disagree the previous notes stay on screen rather than
 * flickering to nothing — a caption one commit behind is what an annotation
 * of a result is.
 *
 * **In an effect, not in a `useMemo`.** These are secondary numbers about a
 * result the screen is already showing, and running them during render would
 * put them *ahead* of the search they annotate — the port would be asked
 * "how many without the account filter" before it had been asked for the
 * rows at all. An effect also keeps a render React may discard from reaching
 * the database. The first paint therefore carries no notes; they arrive on
 * the commit after, which is the right order for a caption.
 *
 * **The `applied` filter, never the typed one.** `text` reaches the query
 * 250 ms after the keystroke (`use-debounced-value.ts`), and a count derived
 * from a text the search has not run yet would describe a set nobody is
 * looking at — the numbers would flicker against rows that had not moved.
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

/**
 * The figure these counts are subtracted from, and the filter it is true of.
 *
 * One parameter rather than two, because the pair is one fact: a count and
 * the filter it counts. Split across two arguments, a caller could pass
 * `search.total.count` with a key from somewhere else and the hook would
 * have no way to notice.
 */
export type MatchedTotal = {
  /** `search.total.count`, already on screen, so it is not queried a second time. */
  count: number;
  /** `search.answersTo` — the serialised filter that count answers to. */
  answersTo: string;
};

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
  matched: MatchedTotal,
): FilterExclusionCounts {
  const [counts, setCounts] = useState<FilterExclusionCounts>({});

  // The filter's serialised *shape*, not its identity — the same trigger
  // `use-transaction-search.ts` uses, and for the same reason: a caller
  // rebuilding the object every render must not re-run six searches. It is
  // also the key the search's own `answersTo` is compared against, which is
  // why it is built through `ledgerFilterDraft` — the exact value that hook
  // was handed, serialised by the exact same function.
  const appliedKey = JSON.stringify(ledgerFilterDraft(applied));
  const { count: matchedCount, answersTo } = matched;

  // `applied` is read through `appliedKey`, which is what changes when its
  // shape does; listing the object itself would re-run seven searches on
  // every render a caller happened to rebuild it in.
  // biome-ignore lint/correctness/useExhaustiveDependencies: appliedKey stands in for applied's shape
  useEffect(() => {
    // The search has not answered this filter yet — its count belongs to the
    // previous one, and a subtraction across two filters is a wrong number,
    // not a rough one. The notes already on screen stay until it has.
    if (answersTo !== appliedKey) return;
    const next: FilterExclusionCounts = {};
    for (const dimension of activeFilterDimensions(applied)) {
      const wider = controller.searchTransactions(
        ledgerFilterDraft(without(applied, dimension)),
        undefined,
        { countOnly: true },
      ).total.count;
      // `Math.max` rather than a bare subtraction: a write landing between
      // the screen's own search and these is the one way the wider count can
      // come back smaller, and "excludes −3" is worse than "excludes 0".
      next[dimension] = Math.max(0, wider - matchedCount);
    }
    setCounts(next);
  }, [controller, appliedKey, matchedCount, answersTo]);

  return counts;
}
