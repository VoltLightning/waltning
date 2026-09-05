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
 *
 * **`loadAll` drains the whole filtered period in one go** (DESK3 review
 * round 1, C1). The phone list pages on scroll, which is right for a list
 * whose only affordance is "further down"; a desk *table* sorts by column
 * header, and a sort over the first page alone reorders fifty rows under a
 * header that names a thousand — a wrong answer that looks like a right one.
 * So the desk branch asks for every page up front. Each page is a synchronous
 * SQLite read on the replica (see the top of this doc), so the drain is an
 * ordinary `while` rather than a chain of awaits, and it happens inside the
 * one `runFromStart` a filter change or a write already triggers.
 *
 * **`SEARCH_LOAD_ALL_CAP` is a ceiling, not a page size.** Some filter
 * somewhere selects a decade; loading it would freeze the tab, and silently
 * truncating it would put C1 straight back. The drain stops at the cap with
 * its cursor still set, `capped` goes true, and the screen owes the reader
 * both halves of the truth — how many rows are loaded and how many match.
 *
 * **`capped` and `incomplete` are two different endings, and the reader is
 * owed the difference** (L2, round 2). The drain also stops when a page
 * comes back with zero rows while still advancing the cursor — a port
 * misbehaving, not a filter selecting a decade. Both leave a cursor set;
 * only one of them is something narrowing the filter would fix. Reporting
 * the second as "capped" would tell a reader to narrow a filter that is
 * already narrow, and hide a broken read behind advice.
 *
 * **Pages are pushed into one array, not spread into a new one per page**
 * (M4, round 2). `rows = [...rows, ...page.rows]` inside the drain copies
 * every row loaded so far on every page — quadratic in the number of pages,
 * which is precisely the loop the cap exists to bound. The array is local to
 * one `runFromStart` call and is never handed out until the drain is done,
 * so mutating it is not a shared-state trade; it is the same array arriving
 * in `setState` either way.
 *
 * **`subscribe` re-runs the whole query, even when the screen is not on
 * screen.** A focused/visible gate belongs here in principle — a background
 * tab re-draining five thousand rows on every write is waste — but there is
 * nothing to gate on: this package may not name a platform, and neither
 * `apps/mobile/src/platform.ts` (the forced file) nor anything else in the
 * repo exposes a focus or visibility signal today. Adding one is a platform
 * read with an owner and a file, not something to smuggle in through a
 * `document.visibilityState` here. Stated rather than silently skipped.
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
  /**
   * `loadAll` only: the drain stopped at `cap` with pages still unread, so
   * `rows` is a prefix of the filtered set rather than the whole of it.
   * Narrowing the filter is the fix, and the screen says so.
   */
  capped: boolean;
  /**
   * `loadAll` only: the drain stopped because a page returned no rows while
   * still handing back a cursor — the port disagreeing with itself. `rows`
   * is a prefix too, but narrowing the filter would not help (L2, round 2).
   */
  incomplete: boolean;
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
  /** The drain stopped on an empty page rather than at the cap — see `TransactionSearchState`. */
  incomplete: boolean;
};

const INITIAL: Internal = {
  rows: [],
  total: EMPTY_TOTAL,
  cursor: undefined,
  loaded: false,
  error: undefined,
  incomplete: false,
};

function readError(caught: unknown): string {
  return caught instanceof Error ? caught.message : String(caught);
}

/** The row ceiling a `loadAll` drain stops at — see this file's own doc. */
export const SEARCH_LOAD_ALL_CAP = 5000;

export type TransactionSearchOptions = {
  /** Load every page of the filtered set up front, not one page per scroll (C1). */
  loadAll?: boolean;
  /** Override the drain's own ceiling — a test's lever, not a screen's. */
  cap?: number;
};

export function useTransactionSearch(
  controller: PhoneLedgerController,
  filter: TransactionFilterDraft,
  options: TransactionSearchOptions = {},
): TransactionSearchResult {
  const [state, setState] = useState<Internal>(INITIAL);
  // Destructured to primitives before they reach a dependency array — a
  // caller passing `{ loadAll: true }` inline would otherwise hand
  // `runFromStart` a new identity every render, which is the very effect
  // loop `filterKey` exists to avoid one file-doc paragraph above.
  const loadAll = options.loadAll === true;
  const cap = options.cap ?? SEARCH_LOAD_ALL_CAP;

  // Read fresh inside a callback without becoming part of its identity — see
  // this file's own doc for why that split is load-bearing here.
  const filterRef = useRef(filter);
  filterRef.current = filter;
  const filterKey = JSON.stringify(filter);

  const runFromStart = useCallback(() => {
    try {
      const first = controller.searchTransactions(filterRef.current);
      const rows: PhoneSearchTransaction[] = [...first.rows];
      let cursor = first.nextCursor;
      let total = first.total;
      let incomplete = false;
      while (loadAll && cursor !== undefined && rows.length < cap) {
        const page = controller.searchTransactions(filterRef.current, cursor);
        // A page that advances the cursor without returning a row would spin
        // here forever — the loop stops on the port rather than trusting it,
        // and says which of the two endings this was.
        if (page.rows.length === 0) {
          incomplete = true;
          break;
        }
        rows.push(...page.rows);
        cursor = page.nextCursor;
        total = page.total;
      }
      setState({ rows, total, cursor, loaded: true, error: undefined, incomplete });
    } catch (caught) {
      setState((current) => ({ ...current, loaded: true, error: readError(caught) }));
    }
  }, [controller, loadAll, cap]);

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
          incomplete: current.incomplete,
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
    capped: loadAll && state.cursor !== undefined && !state.incomplete,
    incomplete: loadAll && state.incomplete,
    loadMore,
    retry: runFromStart,
  };
}
