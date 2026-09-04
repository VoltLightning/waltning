/**
 * S10's paged search over the phone controller — `useTransactionSearch`.
 *
 * **Synchronous, unlike `use-query.ts`'s hook.**
 * `PhoneLedgerController#searchTransactions` is a SQLite read on the replica,
 * same as every other port call this package wraps — there is no promise to
 * await. `loaded` still exists: the first paint happens before `useEffect`
 * runs, so there is a real (if brief) window with no result yet, and S10 §6
 * wants a skeleton drawn for exactly that window rather than an empty list
 * flashing before the real one.
 *
 * **A write resets the list to its first page.** The controller's own
 * `subscribe` fires after every successful write (`refresh()` inside
 * `createPhoneLedger`), and a swipe-categorize is exactly such a write — the
 * row the gesture touched must stop matching a category filter immediately,
 * not after the next explicit search. Trading the scroll position for that is
 * the same choice `TransactionList` already makes implicitly by having none to
 * lose; a longer list paying that cost is the follow-up worth naming rather
 * than solving here.
 *
 * **The filter reaches the query through a ref, and its *shape* (not its
 * identity) is what re-triggers the effect.** A screen rebuilding a filter
 * object every render (unmemoised) must not refetch every render — the same
 * trap `useEffect([deps])` sets for any caller-built object, and one this
 * hook hits on itself: reading `filter` straight from a `useCallback` closure
 * makes the callback's own identity depend on `filter`'s identity, which
 * changes the effect's dependency, which re-subscribes, which calls the
 * callback, which sets state, which re-renders, which (for a caller passing
 * a fresh literal, exactly what `use-transaction-search.test.ts`'s inline
 * `{}` does) hands back *another* new `filter` reference — an effect loop
 * with no caller mistake to point at. The ref breaks that: `runFromStart`'s
 * own identity depends only on `controller`, and `filterKey` (`filter`'s
 * serialised shape) is the effect's sole trigger for "the filter actually
 * changed."
 *
 * **Errors are caught, not thrown through a render.** A corrupt replica read
 * is still possible even offline-only — S10 §6's `ErrorState(recoverable)`
 * needs something to react to, and `retry` just re-runs the same query.
 */

import { useCallback, useEffect, useRef, useState } from "react";
import type {
  PhoneLedgerController,
  PhoneSearchPage,
  PhoneSearchTransaction,
  TransactionFilterDraft,
  TransactionSearchCursorDraft,
} from "./create-phone-ledger.ts";

export type TransactionSearchState = {
  rows: readonly PhoneSearchTransaction[];
  total: PhoneSearchPage["total"];
  /** False only before the first page has ever resolved. */
  loaded: boolean;
  /** Set by a failed read; cleared by the next successful one. */
  error: string | undefined;
  /** Whether another page exists — `loadMore` is a no-op once this is false. */
  hasMore: boolean;
};

export type TransactionSearchResult = TransactionSearchState & {
  loadMore: () => void;
  retry: () => void;
};

const EMPTY_TOTAL: PhoneSearchPage["total"] = { count: 0, currencies: [] };

type Internal = {
  rows: readonly PhoneSearchTransaction[];
  total: PhoneSearchPage["total"];
  cursor: TransactionSearchCursorDraft | undefined;
  loaded: boolean;
  error: string | undefined;
};

const INITIAL: Internal = {
  rows: [],
  total: EMPTY_TOTAL,
  cursor: undefined,
  loaded: false,
  error: undefined,
};

function readError(caught: unknown): string {
  return caught instanceof Error ? caught.message : String(caught);
}

export function useTransactionSearch(
  controller: PhoneLedgerController,
  filter: TransactionFilterDraft,
): TransactionSearchResult {
  const [state, setState] = useState<Internal>(INITIAL);

  // Read fresh inside a callback without becoming part of its identity — see
  // this file's own doc for why that split is load-bearing here.
  const filterRef = useRef(filter);
  filterRef.current = filter;
  const filterKey = JSON.stringify(filter);

  const runFromStart = useCallback(() => {
    try {
      const page = controller.searchTransactions(filterRef.current);
      setState({
        rows: page.rows,
        total: page.total,
        cursor: page.nextCursor,
        loaded: true,
        error: undefined,
      });
    } catch (caught) {
      setState((current) => ({ ...current, loaded: true, error: readError(caught) }));
    }
  }, [controller]);

  // `filterKey` is not read in this body — it is the trigger, standing in for
  // `filter`'s shape so a caller's unmemoised object does not refetch on
  // every render (this file's own doc comment).
  // biome-ignore lint/correctness/useExhaustiveDependencies: filterKey triggers a re-run; runFromStart reads the ref
  useEffect(() => {
    runFromStart();
    return controller.subscribe(runFromStart);
  }, [controller, runFromStart, filterKey]);

  const loadMore = useCallback(() => {
    setState((current) => {
      if (current.cursor === undefined) return current;
      try {
        const page = controller.searchTransactions(filterRef.current, current.cursor);
        return {
          rows: [...current.rows, ...page.rows],
          total: page.total,
          cursor: page.nextCursor,
          loaded: true,
          error: undefined,
        };
      } catch (caught) {
        return { ...current, error: readError(caught) };
      }
    });
  }, [controller]);

  return {
    rows: state.rows,
    total: state.total,
    loaded: state.loaded,
    error: state.error,
    hasMore: state.cursor !== undefined,
    loadMore,
    retry: runFromStart,
  };
}
