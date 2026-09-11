import type { AccountingDate } from "@waltning/core/date";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type {
  PhoneLedgerController,
  PhoneSearchCursor,
  PhoneSearchFilter,
  PhoneSearchTransaction,
} from "../create-phone-ledger/create-phone-ledger.ts";

/** What the List page holds while a reader walks away from an anchor. */
type Half = {
  rows: readonly PhoneSearchTransaction[];
  cursor: PhoneSearchCursor | undefined;
  /** Distinguishes "not loaded yet" from "loaded, and that was the end". */
  loaded: boolean;
};

const EMPTY_HALF: Half = { rows: [], cursor: undefined, loaded: false };

export type LedgerList = {
  /**
   * Newest first, both halves concatenated — **rows, not days.**
   *
   * Grouping them into days with their totals is `transactions/ledger-days`,
   * a module `tests/module-boundaries.test.ts` keeps apart from this one, and
   * the screen composes the two. `group-by-day` refused the same import for
   * the same reason: the seam is worth more than the convenience, and paging
   * and grouping are genuinely separate concerns — one needs a controller,
   * the other needs only a date.
   */
  rows: readonly PhoneSearchTransaction[];
  /** Another page exists in that direction; absent means the ledger's own end. */
  hasOlder: boolean;
  hasNewer: boolean;
  loadOlder: () => void;
  loadNewer: () => void;
};

export type LedgerListOptions = {
  /** Where the list is centred. Changing it is a jump, and discards both halves. */
  anchor: AccountingDate;
  /**
   * The device's own today — **read to decide whether the newer half is a
   * horizon or the rest of the ledger**, never to bound a query.
   *
   * A cold open is anchored on today (S04 §6), and *newer than today* is the
   * forward horizon: expected entries to the end of the month, a handful of
   * rows. A jump is anchored in the past, and *newer than then* is everything
   * that has happened since — which §6 says a jump must not load.
   */
  today: AccountingDate;
  /**
   * **`from`/`to` are excluded, `text` is not.** The anchor walk owns the date
   * window — a filter that also bounded it would be two things deciding which
   * rows exist. Text is the screen's search (S04 §7: *"Search is the strip's
   * icon, and it filters this list"*), and it was excluded here for no reason
   * beyond the desk owning search when this was written.
   */
  filter?: Omit<PhoneSearchFilter, "from" | "to"> | undefined;
};

/**
 * S04's List page: the ledger walked in both directions from an anchor.
 *
 * **The two halves never interact, and that is what makes a jump cheap**
 * (S04 §6). Picking a far date discards both and starts a fresh pair, so
 * nothing between there and today is ever loaded — the list is never asked to
 * hold a scroll position for content it does not have, which is the defect
 * that makes infinite lists jump under the reader.
 *
 * **The anchor's own page belongs to the older half**, because `readLedgerPage`
 * makes it inclusive going older and exclusive going newer.
 *
 * **Only the older half is fetched on mount, unless the anchor is today.** A
 * reader who opens on today and pulls down expects what is coming to already
 * be there, and *newer than today* is the forward horizon — a handful of
 * expected rows (S04 §6). *Newer than a jump* is the whole ledger since, and
 * fetching it put the newest thirty rows of the ledger at the top of a list
 * whose header named the month jumped to: picking May drew September under a
 * title reading *May*, because the rows above the anchor are the ones a
 * reverse-chronological list draws first. §6 is explicit — a jump *"loads
 * that date's neighbourhood and **nothing between**"* — and this is where
 * "nothing between" is kept. The newer half still pages; it waits to be
 * asked.
 *
 * **Rows are concatenated newest-first**, which is the order both halves
 * already arrive in — `readLedgerPage` reverses its ascending read so a caller
 * never reverses at the seam.
 */
export function useLedgerList(
  ledger: PhoneLedgerController,
  { anchor, today, filter }: LedgerListOptions,
): LedgerList {
  const [older, setOlder] = useState<Half>(EMPTY_HALF);
  const [newer, setNewer] = useState<Half>(EMPTY_HALF);

  /**
   * Every page this list has already asked for, by the request that would ask
   * for it again.
   *
   * **The read must not live inside a `setState` updater.** An updater is
   * called whenever React decides to — twice under StrictMode, and again on a
   * replayed render — and a read there is a side effect that runs each time,
   * appending the same page twice. The rows are a synchronous SQLite read, so
   * that duplication is silent and permanent rather than a flicker.
   *
   * A ref rather than state, because it must be true the instant a request is
   * issued: two calls in the same tick, which is exactly what a fling produces
   * at both ends of the viewport, would otherwise both see the same
   * not-yet-rendered state and both read.
   */
  const issued = useRef(new Set<string>());
  // A jump: both halves go and the effects below refill them at the new
  // anchor. Keyed on the filter too, because a filter is a different ledger
  // for this purpose — rows loaded under the old one are not a page of the
  // new one, and keeping them would show a filter that had not been applied.
  //
  // **Adjusted during render, not in an effect.** React's own endorsed
  // pattern for "reset when a prop changed", and the one `today-screen`
  // already uses for its toast nonce: an effect would let one render draw the
  // old anchor's rows under the new anchor's label before the reset arrived.
  const listKey = `${anchor}|${JSON.stringify(filter ?? {})}`;
  const [lastKey, setLastKey] = useState(listKey);
  if (listKey !== lastKey) {
    setLastKey(listKey);
    issued.current = new Set();
    setOlder(EMPTY_HALF);
    setNewer(EMPTY_HALF);
  }

  const read = useCallback(
    (direction: "older" | "newer", cursor: PhoneSearchCursor | undefined) =>
      ledger.readLedgerPage({
        anchor,
        direction,
        ...(cursor ? { cursor } : {}),
        ...(filter ? { filter } : {}),
      }),
    [ledger, anchor, filter],
  );

  const requestKey = useCallback(
    (direction: "older" | "newer", cursor: PhoneSearchCursor | undefined) =>
      `${listKey}|${direction}|${cursor ? `${cursor.date}:${cursor.id}` : "first"}`,
    [listKey],
  );

  const loadOlder = useCallback(() => {
    if (older.loaded && older.cursor === undefined) return;
    const key = requestKey("older", older.cursor);
    if (issued.current.has(key)) return;
    issued.current.add(key);
    const page = read("older", older.cursor);
    setOlder((half) => ({
      rows: [...half.rows, ...page.rows],
      cursor: page.nextCursor,
      loaded: true,
    }));
  }, [older, read, requestKey]);

  const loadNewer = useCallback(() => {
    if (newer.loaded && newer.cursor === undefined) return;
    const key = requestKey("newer", newer.cursor);
    if (issued.current.has(key)) return;
    issued.current.add(key);
    const page = read("newer", newer.cursor);
    // Prepended: the newer half grows upward, and its pages arrive
    // newest-first, so each new page sits above everything already held.
    setNewer((half) => ({
      rows: [...page.rows, ...half.rows],
      cursor: page.nextCursor,
      loaded: true,
    }));
  }, [newer, read, requestKey]);

  // The first page of each half, once per anchor. Not `loadOlder()` in the
  // reset effect above: that would read through a `ledger` the reset has not
  // finished re-rendering against.
  useEffect(() => {
    if (!older.loaded) loadOlder();
  }, [older.loaded, loadOlder]);
  /**
   * **The newer half pre-fills only from today**, where it is the forward
   * horizon rather than the rest of the ledger — see this hook's own header
   * for the defect the unconditional version shipped. From a past anchor it
   * waits for `loadNewer()`, which is the reader walking up out of the
   * neighbourhood they jumped to.
   */
  const ahead = anchor >= today;
  useEffect(() => {
    if (ahead && !newer.loaded) loadNewer();
  }, [ahead, newer.loaded, loadNewer]);

  const rows = useMemo(() => [...newer.rows, ...older.rows], [newer.rows, older.rows]);

  return {
    rows,
    hasOlder: !older.loaded || older.cursor !== undefined,
    hasNewer: !newer.loaded || newer.cursor !== undefined,
    loadOlder,
    loadNewer,
  };
}
