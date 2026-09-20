import type { PhoneLedgerController } from "@waltning/client/ledger/create-phone-ledger";
import type { ListStartGate } from "@waltning/client/ledger/list-start-gate";
import { listStartGate } from "@waltning/client/ledger/list-start-gate";
import { useLedgerList } from "@waltning/client/ledger/use-ledger-list";
import { reanchors } from "@waltning/client/ledger/use-ledger-list/anchor-echo";
import {
  dayAt,
  type EntryHeights,
  ESTIMATED_HEIGHTS,
  type GeometryEntry,
  listGeometry,
} from "@waltning/client/ledger/use-ledger-list/list-geometry";
import { ribbonDays, toLedgerItems } from "@waltning/client/transactions/ledger-days";
import { type AccountingDate, accountingDate } from "@waltning/core/date";
import type { CurrencyCode } from "@waltning/core/money";
import { dayLabel, dayRangeLabel, weekdayInitial } from "@waltning/ui/i18n/locales";
import { useLocale, useT } from "@waltning/ui/i18n/provider";
import { pageScrollProps } from "@waltning/ui/primitives/nested-scroll";
import { useScrollSettle } from "@waltning/ui/primitives/use-scroll-settle";
import { GroundPanel, type ScrollHandler } from "@waltning/ui/shell/card";
import { useGroundInset } from "@waltning/ui/shell/ground-inset";
import { TodayPill } from "@waltning/ui/shell/today-pill";
import { text } from "@waltning/ui/theme/fonts";
import { makeStyles } from "@waltning/ui/theme/styles";
import { space } from "@waltning/ui/tokens";
import {
  DayRibbon,
  type RibbonDay,
} from "@waltning/ui/transactions/molecules/day-ribbon/day-ribbon";
import {
  EMPTY_PLACEMENT,
  type StripPlacement,
} from "@waltning/ui/transactions/molecules/day-ribbon/scrub";
import {
  type DayRowPlaceName,
  dateOfEntry,
  type ListEntry,
} from "@waltning/ui/transactions/molecules/list-entry/entry";
import {
  ListEntryCell,
  type ListEntryHandlers,
} from "@waltning/ui/transactions/molecules/list-entry/list-entry";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { type FlatList, Text, View, type ViewToken } from "react-native";
import Animated, { type SharedValue, useSharedValue } from "react-native-reanimated";

/**
 * S04's List page — the whole ledger, continuous in both directions.
 *
 * **A page, not a screen.** It fetches, which is a screen's privilege, and it
 * composes; the chrome above it belongs to `PagerFrame` and the anchor it
 * walks away from belongs to the route. What it owns is the mapping from
 * ledger rows to the things a reader sees.
 *
 * **Two modules meet here and nowhere else.** `useLedgerList` pages and
 * returns rows; `toLedgerItems` groups them into days with their totals.
 * `tests/module-boundaries.test.ts` keeps `ledger/` and `transactions/` apart
 * inside `packages/client`, so the composition is the app's — the same reason
 * `group-by-day` is generic over its row rather than importing one.
 */

export type HomeListPageProps = {
  ledger: PhoneLedgerController;
  /**
   * Where the list is centred. A change is a jump: both halves reload (S04 §6)
   * — **unless it is a date this list just reported**, which is the screen
   * handing back what the scroll said and is not news (`visible-day.ts`).
   */
  anchor: AccountingDate;
  /**
   * The day the reader has scrolled to, as it changes.
   *
   * S04 §6: *"scroll to 25 May on List and Calendar has 25 May marked."* The
   * list is the only thing that knows which day is on screen, and it reports
   * rather than writes — where that day is kept is the screen's business.
   */
  onVisibleDay?: (date: AccountingDate) => void;
  /** The device's own today, which stays marked wherever the list has scrolled. */
  today: AccountingDate;
  /**
   * `snapshot.revision` — a write anywhere re-reads what the list holds, in
   * place, so the transaction just saved on S05 is on the page the reader
   * comes back to without the reader being moved (`use-ledger-list.ts`'s own
   * option). Not part of the list's key: a key change is a jump.
   */
  revision: number;
  pivotCurrency: CurrencyCode;
  pivotDecimals: number;
  onPickDay: (date: string) => void;
  onOpenTransaction: (id: string) => void;
  /**
   * Short swipe (S04 §7). The kind travels with the id because the screen owns
   * the sheet and the sheet needs to know which tree to open — and this page
   * is the only thing holding the row.
   */
  onCategorize: (id: string, kind: "income" | "expense") => void;
  /**
   * The way back from a jump (§6). The pill is drawn only when the anchor is
   * not today, so this is never the no-op it looks like.
   */
  onReturnToToday: () => void;
  /**
   * The screen's search (§7), or `null`.
   *
   * **It narrows more than the rows.** A filtered set has no day totals to
   * state and no quiet days to mark — its gaps are days the query excluded, not
   * days the ledger was quiet on — so it reaches `toLedgerItems` and
   * `ribbonDays` as their `filtered` option too. §7 says the day grouping
   * survives; it is the *rules about what the gaps mean* that do not.
   */
  query: string | null;
  /**
   * Forwarded to the list, for chrome that moves with the page. This screen
   * owns its scroller — the panel around it is `scroll="own"`, a plain `View`
   * — so it is the only thing that can report the offset the header collapses
   * from.
   */
  onScroll?: ScrollHandler | undefined;
  /**
   * The same offset as `onScroll`, as a value the UI thread can read.
   *
   * **The strip is a function of this** (S04 §7): it is interpolated against
   * the list's day tops and written straight to the strip's scroller, without
   * React seeing a frame of it. The screen owns it because the header
   * collapses from the same number, and `list-start-gate.ts` is right that two
   * animated scroll handlers do not compose — so there is exactly one, up
   * there, and this is what it writes.
   */
  scrollY: SharedValue<number>;
  /**
   * The strip's tick, one light tap per day crossed while a hand is on it.
   *
   * Platform-bound, so the screen supplies it: `packages/ui` may not name
   * `expo-haptics`, and the web half of that seam is nothing.
   */
  onTick?: (() => void) | undefined;
  /**
   * Whether this page is the one on screen.
   *
   * **Because `scrollY` belongs to the screen, not to this page.** All four
   * pages are mounted at once and all four write that one offset, so without
   * this the settle below read *Summary's* scroll position through the
   * *List's* day positions and wrote whatever day that happened to land on —
   * a gesture that is not a selection at all silently re-dating the whole
   * screen, which is the exact class of defect this page was rebuilt to end.
   */
  active: boolean;
  /**
   * What stands in place of the list when there is nothing in it (§6, *Empty ·
   * no transactions*).
   *
   * **The screen composes it, not this page.** Which emptiness it is — a
   * ledger nobody has captured into yet, or a month that happens to be quiet —
   * is a question about the whole ledger, and the action it offers belongs to
   * the screen that owns navigation. A list that guessed would be a list with
   * an opinion about the app around it.
   */
  empty: React.ReactNode;
};

export function HomeListPage({
  ledger,
  anchor,
  onVisibleDay,
  today,
  revision,
  pivotCurrency,
  pivotDecimals,
  onPickDay,
  onOpenTransaction,
  onCategorize,
  onReturnToToday,
  query,
  onScroll,
  scrollY,
  onTick,
  active,
  empty,
}: HomeListPageProps) {
  const t = useT();
  const locale = useLocale();
  const styles = useStyles();
  // A new object per render would re-key the list and discard both halves on
  // every keystroke — `useLedgerList` treats a filter change as a jump, which
  // is right for a *different* filter and ruinous for an identical one.
  const filter = useMemo(() => (query === null ? undefined : { text: query }), [query]);
  // One list per anchor and query — what the gate, and the scroll to the
  // anchor, both reset on.
  /**
   * **What this list is built around, which is not always what it was told.**
   *
   * A date the list itself reported comes back as the `anchor` prop, and
   * taking that at face value re-keys the list, discards both halves and
   * scrolls the reader back to where they started — the scroll fighting
   * itself. `reanchors` is the rule; this is the state it guards.
   */
  const [centred, setCentred] = useState(anchor);
  const reported = useRef<string | null>(null);
  const visibleDayRef = useRef(onVisibleDay);
  visibleDayRef.current = onVisibleDay;

  useEffect(() => {
    if (!reanchors(anchor, centred, reported.current)) return;
    // A jump is a fresh start: nothing this list said before it applies to
    // where it is now.
    reported.current = null;
    setCentred(anchor);
  }, [anchor, centred]);

  const listKey = `${centred}|${query ?? ""}`;
  const { rows, settled, hasOlder, hasNewer, loadOlder, loadNewer } = useLedgerList(ledger, {
    anchor: centred,
    filter,
    revision,
  });
  const items = useMemo(
    // A filtered set has no gaps to explain and no day totals to state —
    // `ledger-days`' own `filtered` option carries the whole argument. The
    // anchor is always an item: the day this page is on is on this page.
    //
    // **Nothing until both halves have answered.** Rows arrive in the same
    // passive flush as the mount, so this is one frame — but a quiet line
    // drawn from an empty `rows` before the read is the list asserting
    // *nothing that day* about a day it has not looked at, and over an empty
    // ledger the first-run state stands where the rows would, with no line
    // above it saying today was quiet.
    () =>
      settled && rows.length > 0
        ? toLedgerItems(rows, pivotCurrency, { filtered: query !== null, anchor })
        : [],
    [rows, settled, pivotCurrency, query, anchor],
  );

  const days = useMemo<readonly RibbonDay[]>(
    () =>
      // The strip gets the anchor in its own right, so the day this page is
      // named for has a cell from the first frame and over an empty ledger —
      // the one cell an empty List has.
      ribbonDays(items, { filtered: query !== null, anchor, today }).map((day) => ({
        date: day.date,
        day: Number(day.date.slice(8, 10)),
        weekday: weekdayInitial(day.date, locale),
        activity: day.activity,
        direction: day.direction,
        ...(day.date === today ? { today: true } : {}),
        ...(day.date > today ? { ahead: true } : {}),
        // The full date and what happened, never the bare number the eye
        // reads: a run of them says nothing about which month or which year.
        // **`entries` is the *loaded* rows, which is a third reading of the
        // search and disagrees with the other two.** A day holding forty
        // matches renders thirty of them in one page, so "30 entries" would
        // stand under a grid cell reading 40. Under a filter the cell says it
        // matched and leaves the counting to the pages built to count.
        label:
          query !== null
            ? t("transactions.ribbonDayMatched", { date: dayLabel(day.date, locale) })
            : day.entries === 0
              ? t("transactions.ribbonDayEmpty", { date: dayLabel(day.date, locale) })
              : t(day.entries === 1 ? "transactions.ribbonDayOne" : "transactions.ribbonDayMany", {
                  date: dayLabel(day.date, locale),
                  count: day.entries,
                }),
      })),
    [items, locale, query, t, today, anchor],
  );

  const entries = useMemo<readonly ListEntry[]>(() => {
    const out: ListEntry[] = [];
    for (const item of items) {
      if (item.kind === "quiet") {
        // `from` is the newer end and `to` the older one — the list runs
        // backwards, and a span written the other way round would read as a
        // range nobody could find.
        out.push(
          item.days === 1
            ? {
                key: `quiet-${item.from}`,
                kind: "quiet",
                date: item.from,
                label: dayLabel(item.from, locale),
              }
            : {
                key: `run-${item.from}`,
                kind: "run",
                // One range, not two dates: the row exists to say nothing
                // happened, and `September 7, 2026 – September 8, 2026` spends
                // two lines of a 390pt phone spelling the month and the year
                // twice to say it. `dayRangeLabel` collapses what the two ends
                // share, in whichever half of the phrase the language keeps it.
                label: dayRangeLabel(item.to, item.from, locale),
                days: item.days,
                from: item.from,
              },
        );
        continue;
      }
      out.push({
        key: `day-${item.date}`,
        kind: "day",
        date: item.date,
        first: out.length === 0,
        label: dayLabel(item.date, locale),
        total:
          item.total.kind === "filtered"
            ? { pivot: "filtered" as const }
            : item.total.kind === "unpriced"
              ? { pivot: null }
              : { pivot: item.total.pivot, approximate: item.total.approximate },
      });
      // Where a row sits in its day decides its corners, which is what makes
      // the day read as one surface rather than a run of separate ones.
      item.rows.forEach((row, at) => {
        const place: DayRowPlaceName =
          item.rows.length === 1
            ? "only"
            : at === 0
              ? "first"
              : at === item.rows.length - 1
                ? "last"
                : "middle";
        out.push({ key: row.id, kind: "row", row, place });
      });
    }
    return out;
  }, [items, locale]);

  /**
   * **Where each day sits, and which cell of the strip it is.**
   *
   * The two arrays `DayRibbon` is scrubbed by (`list-geometry.ts`). Derived
   * from the entries rather than measured per day, because a measured map goes
   * stale the instant `maintainVisibleContentPosition` prepends an older page
   * — every position below the insertion moves, and a strip driven by the old
   * numbers is confidently wrong rather than visibly broken.
   */
  const cellOf = useMemo(() => {
    const at = new Map(days.map((day, index) => [day.date, index]));
    const first = days[0]?.date ?? "";
    const last = days.length - 1;
    return (date: string): number => {
      const found = at.get(date);
      if (found !== undefined) return found;
      // Outside `RIBBON_REACH`: clamp to the nearer end, which is what keeps
      // the interpolation monotonic across a stretch the strip cannot follow.
      return date < first ? 0 : last < 0 ? 0 : last;
    };
  }, [days]);

  /**
   * One height per kind, measured once each.
   *
   * **Measured rather than read off the tokens**, so the strip is still right
   * at a font scale the constants were not written at — `lineHeightFor` scales
   * a day header and `touchTarget.row` does not scale a row, and a table that
   * assumed either would drift a few points per day into a whole cell over a
   * month. A ref plus a counter rather than state: `noteHeight` returns on the
   * second of each kind, so the five measurements cost five renders at mount
   * and nothing at all afterwards.
   */
  /**
   * One height per kind, measured once each.
   *
   * **Measured rather than read off the tokens**, so the strip is still right
   * at a font scale the constants were not written at — `lineHeightFor` scales
   * a day header and `touchTarget.row` does not scale a row, and a table that
   * assumed either would drift a few points per day into a whole cell over a
   * month.
   *
   * **State, and the updater returns the same object when nothing changed** —
   * which is React's own bail-out, so the five measurements at mount cost five
   * renders and every measurement after them costs none. A ref with a counter
   * beside it was written first and was worse in the way that matters: the
   * counter was a dependency that existed to be listed and never read, which
   * is a lie the linter was right to call out.
   */
  const [heights, setHeights] = useState<EntryHeights>(ESTIMATED_HEIGHTS);
  const noteHeight = useCallback((key: keyof EntryHeights, height: number) => {
    const found = Math.round(height);
    // **Written as *not greater than zero*, because `NaN <= 0` is `false`.**
    // A measurement that arrives non-finite would otherwise be stored, and a
    // `NaN` in the height table makes every comparison in `fracFor` false — so
    // the strip pins on its oldest cell and every settle reports the oldest
    // day, with nothing thrown and no `NaN` anywhere in the output.
    if (!(found > 0)) return;
    setHeights((seen) => (seen[key] === found ? seen : { ...seen, [key]: found }));
  }, []);

  const shape = useMemo<readonly GeometryEntry[]>(
    () =>
      entries.map((entry) => ({
        kind: entry.kind,
        date: dateOfEntry(entry),
        ...(entry.kind === "day" ? { first: entry.first } : {}),
      })),
    [entries],
  );
  const geometry = useMemo(() => listGeometry(shape, heights, cellOf), [shape, heights, cellOf]);
  /**
   * **One value, not two arrays.** They were written as two assignments and
   * read together on the UI thread every frame, so a frame landing between the
   * two placed the strip from one list's positions and another's cells. The
   * lengths usually match — the window shifts by one at each end — so a guard
   * on length, which is what `fracFor` had, would never have seen it.
   */
  /*
    **Typed as what the strip reads, not as what the list produces.** The two
    meet here and nowhere else — `packages/ui` may not import `packages/client`
    — so this assignment *is* the join, and `tsc` checks it: a `ListGeometry`
    that stopped carrying `tops` or `marks` would fail on this line. `dates`
    stays on the JS side, where naming a day belongs.
  */
  const placement = useSharedValue<StripPlacement>(EMPTY_PLACEMENT);
  useEffect(() => {
    placement.value = geometry;
  }, [geometry, placement]);

  /**
   * **The one write the scroll makes, and it makes it once.**
   *
   * S04 §3 promises the four pages agree about the date, and §7 says the list
   * writes it *when it settles* rather than while it moves. Both halves of
   * that are load-bearing: without the write, scrolling to 25 May and swiping
   * to Calendar would show the month the reader came from; with the write on
   * every frame, the gesture pays for a reload and a period animation sixty
   * times a second, which is the defect this page was rebuilt around.
   */
  const reportSettled = useCallback(
    (at: number) => {
      // **`dayAt`, never the strip's cell.** The strip clamps every day past
      // its reach onto its end cell, so reading the day back out of it named a
      // real date that was not the one on screen — out by a month on a list
      // holding a collapsed run, and silent, because a settle fires once per
      // stop and the wrong anchor is then quietly accepted.
      const landed = dayAt(at, geometry.tops, geometry.dates);
      if (landed === null || landed === reported.current) return;
      reported.current = landed;
      visibleDayRef.current?.(accountingDate(landed));
    },
    [geometry],
  );
  useScrollSettle(scrollY, reportSettled, active);

  /**
   * **A tap on a day costs what it has to and no more** (S04 §7).
   *
   * The day is usually already in the list — the strip mostly draws loaded
   * days — and then this is a scroll within rows that are already rendered: no
   * query, no reload, and the strip re-attaches because the list moved. Only a
   * day outside the loaded range falls through to a jump, which is what a jump
   * is for. Reloading rows that were two hundred points away is the lag that
   * was reported, not the load.
   */
  /**
   * **Back to today, at the price the distance actually warrants** (S04 §6).
   *
   * The pill used to jump unconditionally: it set the anchor, which re-keyed
   * the list, discarded both halves and paid a synchronous replica read on the
   * press frame — a visible stall, on the one control whose whole job is
   * getting you out of somewhere. Today is usually still loaded, because the
   * reader scrolled away from it rather than jumping, and then this is the
   * same cheap scroll a tap on a cell is.
   */
  const returnToToday = useCallback(() => {
    // **The screen is told either way.** Telling it only on the expensive path
    // was the defect: the cheap path set `reported.current`, which is exactly
    // what makes the settle that follows decline to report — so nothing ever
    // wrote the date, the anchor stayed where it was, and the pill, which is
    // drawn on `anchor !== today`, did not dismiss itself. A control whose
    // whole job is getting you out of somewhere, visibly not doing it.
    onReturnToToday();
    const index = entries.findIndex((entry) => dateOfEntry(entry) === today);
    if (index < 0) return;
    // The rows are already there, so this is the reader moving rather than the
    // ledger being re-read. `reported` stops the write coming back as a jump
    // (`anchor-echo.ts`); it is not what decides whether to write.
    reported.current = today;
    list.current?.scrollToIndex({ index, animated: true, viewPosition: 0 });
  }, [entries, today, onReturnToToday]);

  const pickDay = useCallback(
    (date: string) => {
      // **Always, not only on the jump.** A tap is a selection whichever way
      // it is served, and the four pages share one date — so a tap that only
      // scrolled left the ring on one cell and `current` on another, which is
      // the two-sources-of-truth this component's own header forbids, and left
      // Calendar, Summary and Months on the day before it.
      onPickDay(date);
      const index = entries.findIndex((entry) => dateOfEntry(entry) === date);
      if (index < 0) return;
      reported.current = date;
      list.current?.scrollToIndex({ index, animated: true, viewPosition: 0 });
    },
    [entries, onPickDay],
  );

  /**
   * Everything a cell can ask this screen to do, as one object.
   *
   * **Memoised once**, because `ListEntryCell`'s `memo` compares it: three
   * separate handler props were three chances to hand down a fresh function
   * and re-render every visible row on the next scroll frame.
   */
  const handlers = useMemo<ListEntryHandlers>(
    () => ({ onOpenTransaction, onCategorize, onPickDay }),
    [onOpenTransaction, onCategorize, onPickDay],
  );
  const renderItem = useCallback(
    ({ item }: { item: ListEntry }) => (
      <ListEntryCell
        entry={item}
        handlers={handlers}
        currency={pivotCurrency}
        decimals={pivotDecimals}
        onMeasure={noteHeight}
      />
    ),
    [handlers, pivotCurrency, pivotDecimals, noteHeight],
  );

  const keyExtractor = useCallback((entry: ListEntry) => entry.key, []);

  /**
   * **The list opens on the anchor, wherever the anchor's neighbourhood put
   * it.** The newer half renders above the anchor — it is newer — so a jump
   * into a dense month would otherwise open on the rows that followed the day
   * rather than on the day. Scrolled once per anchor, without animation, on
   * the first render that has the anchor's cell to scroll to; a cold open has
   * it at index 0 and scrolls nowhere. `onScrollToIndexFailed` is the
   * platform's own way of saying the cell is not laid out yet: land near it
   * by the average cell and ask again next frame.
   */
  const list = useRef<FlatList<ListEntry>>(null);
  const anchorIndex = useMemo(
    () =>
      entries.findIndex(
        (entry) => (entry.kind === "day" || entry.kind === "quiet") && entry.date === anchor,
      ),
    [entries, anchor],
  );
  const scrolledFor = useRef<string | null>(null);
  useEffect(() => {
    if (anchorIndex <= 0 || scrolledFor.current === listKey) return;
    scrolledFor.current = listKey;
    list.current?.scrollToIndex({ index: anchorIndex, animated: false, viewPosition: 0 });
  }, [anchorIndex, listKey]);
  const handleEndReached = useCallback(() => {
    if (hasOlder) loadOlder();
  }, [hasOlder, loadOlder]);
  /**
   * **Has the reader ever left the top of this list?** — `list-start-gate.ts`,
   * where the rule and the defect it exists for are written down and tested
   * without a renderer.
   *
   * The gate's whole job is to tell a reader pulling down from a mounted list
   * apart. If viewability never reported at all, the newer half would simply
   * never auto-load and `TodayPill` and the header's stepper would be the way
   * out — which is what S04 §6 says they are.
   */
  const gate = useRef<ListStartGate>(undefined);
  gate.current ??= listStartGate();
  // A new list is a new answer to the question. Reset during render, the way
  // `use-pager-route.ts` writes its own ref: an effect runs after the commit,
  // and a start-reached between the two would read the previous list's answer.
  const lastKey = useRef(listKey);
  if (lastKey.current !== listKey) {
    lastKey.current = listKey;
    gate.current.reset();
  }
  // The retry a frame later is for *this* list: a jump between the two would
  // otherwise scroll the new anchor's list to the old anchor's index.
  const settleScroll = useCallback((info: { index: number; averageItemLength: number }) => {
    const key = lastKey.current;
    list.current?.scrollToOffset({
      offset: info.averageItemLength * info.index,
      animated: false,
    });
    requestAnimationFrame(() => {
      if (lastKey.current !== key) return;
      list.current?.scrollToIndex({ index: info.index, animated: false, viewPosition: 0 });
    });
  }, []);
  // Ref-stable: `FlatList` refuses a changing `onViewableItemsChanged`, and
  // this one closes over nothing but a ref.
  //
  // **Viewability no longer reports the day, and that is the fix.** It used to
  // write the shared date from the topmost visible item on every scroll frame,
  // which made each frame of a gesture a selection — a reload, a re-centred
  // strip and a period animation, sixty times a second (S04 §7). What the list
  // is *on* is now read from the offset when it settles, below; what is left
  // here is the start gate, which asks a different question entirely.
  const notedScroll = useRef((info: { viewableItems: ViewToken[] }) => {
    gate.current?.note(info.viewableItems);
  });

  /**
   * The other direction, which the list had no way to ask for.
   *
   * §6 says the ledger is continuous **in both directions**, and
   * `useLedgerList` has paged both since it was written — but `FlatList` was
   * only ever given `onEndReached`, so a reader who jumped to a day could walk
   * backwards from it forever and never forwards. The newer half was loaded
   * once, at the anchor, and then frozen.
   */
  const handleStartReached = useCallback(() => {
    if (gate.current?.opened() !== true) return;
    if (hasNewer) loadNewer();
  }, [hasNewer, loadNewer]);

  const inset = useGroundInset();
  // The gutter and the home-indicator clearance, on the content rather than on
  // the scroller: a `View` around the list clips the scroll bar inside the page
  // and slices a focused row's ring.
  const content = useMemo(() => [styles.content, inset.content], [styles.content, inset.content]);
  // `ListEmptyComponent` takes an element or a component type, and an element
  // built in the prop would be a new one every render.
  //
  // **A `View`, never a fragment.** `FlatList` clones this element and hands it
  // an `onLayout`, which a fragment cannot carry — it logged an error on every
  // render of an empty list and the empty state still drew, which is the kind
  // of breakage only the console reports.
  //
  // **Two emptinesses, and only one of them is the ledger's.** The screen's
  // `empty` is S04 §6's *no transactions* — a claim about the whole ledger,
  // with a first capture offered — and it is right for exactly one:
  //
  // - **Searching.** §6's *Empty · filtered*: the ledger holds rows, this query
  //   does not match them. The first-run wording here would tell a reader with
  //   a full ledger that they have never captured anything, because they typed
  //   a word.
  // - **Nothing anywhere.** Both halves were read from the anchor and neither
  //   found a row, wherever the anchor is: the ledger really is empty, and a
  //   first capture is the thing to offer. A jump *behind* the ledger is not
  //   this — its newer half holds the rows, and the anchor is drawn above them
  //   as its own quiet line.
  //
  // Which one it is is a question about *this page's* query, so this is the
  // part of the empty state the page decides and the screen cannot. Nothing is
  // drawn until the halves have answered — see `items`.
  const emptyElement = useMemo(
    () => (
      <View style={styles.empty}>
        {query !== null ? (
          <Text style={styles.nothingHere}>{t("transactions.noMatchesHere", { query })}</Text>
        ) : (
          empty
        )}
      </View>
    ),
    [query, empty, t, styles.empty, styles.nothingHere],
  );

  return (
    /*
      **`scroll="own"`, because this page owns a virtualised list.** Nesting a
      `FlatList` inside the panel's default `ScrollView` is React Native's
      double-scroll warning, not a second kind of page. The panel then carries
      neither the gutter nor the bottom clearance — both have to land on the
      content that scrolls, which is `inset.content` below. Without the panel
      at all, which is how this shipped, the rows ran to both edges of the
      device and the amounts on the right were cut off by the screen.
    */
    <GroundPanel scroll="own">
      <DayRibbon
        days={days}
        current={anchor}
        scrollY={scrollY}
        placement={placement}
        onPickDay={pickDay}
        onTick={onTick}
      />
      {/*
        **The pill's layer starts where the list does.** §4 puts `TodayPill`
        *over the list*, top-centre, because the add button owns the bottom
        corners and either side edge at any height (`02-tokens` §2.9). The
        ribbon is not the list: §4 lists it separately, under `PageTabs`, and
        it is chrome that does not scroll. Positioned against the whole panel
        the pill sat on the ribbon's first cells — covering one weekday letter
        outright and two 44pt targets carrying the day numbers and their
        activity marks. A floating control over an infinite list covers
        *something*; the choice is what, and the honest answer is a sliver of
        content the reader can move rather than fixed chrome they cannot.
        This `View` is the whole of it — the pill's `position: absolute` now
        resolves against the list's box instead of the panel's.
      */}
      <View style={styles.floatBox}>
        <Animated.FlatList
          ref={list}
          onScrollToIndexFailed={settleScroll}
          data={entries}
          renderItem={renderItem}
          keyExtractor={keyExtractor}
          ListEmptyComponent={settled ? emptyElement : null}
          // So the empty state has the page to sit in rather than a strip at
          // the top of one: with no rows the content is shorter than the
          // scroller.
          contentContainerStyle={content}
          onEndReached={handleEndReached}
          onEndReachedThreshold={END_REACHED_THRESHOLD}
          onStartReached={handleStartReached}
          onStartReachedThreshold={END_REACHED_THRESHOLD}
          // What says the reader has moved — `handleStartReached`'s own doc has
          // the whole argument for why this list watches viewability at all.
          onViewableItemsChanged={notedScroll.current}
          viewabilityConfig={AT_THE_TOP}
          // **Without this the list jumps.** A newer page is *prepended*, so
          // everything below it moves down by the height of what arrived and
          // the row the reader was looking at leaves the screen. This pins the
          // first visible item and lets the content grow above it instead —
          // which is the whole difference between paging forward and being
          // thrown.
          maintainVisibleContentPosition={KEEP_POSITION}
          onScroll={onScroll}
          // 16ms: the header interpolates from this, and the default reports
          // once per gesture — a header that jumps when the finger lifts.
          scrollEventThrottle={16}
          // The page's own vertical scroller, inside the pager's horizontal one.
          {...pageScrollProps(styles.list)}
        />
        {/*
          **After the list, so it paints over it**, and only when the anchor has
          moved: a pill offering *today* while the list is already on today is a
          control that does nothing, which is how a reader learns to stop
          believing it (§6).
        */}
        {anchor === today ? null : (
          <TodayPill
            label={t("shell.today")}
            accessibilityLabel={t("transactions.backToToday", {
              date: dayLabel(anchor, locale),
            })}
            onPress={returnToToday}
          />
        )}
      </View>
    </GroundPanel>
  );
}

/**
 * Six tenths of a screen, not the default tenth: the read is synchronous
 * SQLite, so a page arrives within a frame and asking early costs nothing —
 * where asking late leaves the reader at the end of the list with the next
 * page still being read.
 */
const END_REACHED_THRESHOLD = 0.6;

/**
 * Keep the row the reader is on where it is when a page arrives above it.
 *
 * `minIndexForVisible: 1` rather than `0`: index 0 is the topmost rendered
 * item, and anchoring to it is what makes a list refuse to scroll into new
 * content at all.
 */
const KEEP_POSITION = { minIndexForVisible: 1 } as const;

/**
 * Viewability, as this list uses it: is the very first item on screen at all?
 *
 * One pixel is the threshold because the question is binary — the reader is at
 * the top of the list or they have left it — and a percentage would make a tall
 * first row (a day header plus its first entry) answer *no* while most of it is
 * still visible. Frozen at module scope: `FlatList` refuses a config that
 * changes identity between renders.
 */
const AT_THE_TOP = { viewAreaCoveragePercentThreshold: 0 } as const;

const useStyles = makeStyles((theme) => ({
  root: { flex: 1 },
  list: { flex: 1 },
  // The box `TodayPill` resolves its `position: absolute` against, and the
  // reason it is a box at all — see the JSX. Its own style rather than a second
  // use of `list`: the two happen to want the same one rule and are not the
  // same thing, and the next person to change one must not silently change the
  // other.
  floatBox: { flex: 1 },
  content: { flexGrow: 1 },
  // Centred in the page it was given, not stacked at the top of it.
  empty: { flex: 1, justifyContent: "center" },
  dayHeader: { paddingTop: space.x2, paddingBottom: space.sm },
  firstDayHeader: { paddingBottom: space.sm },
  // A stated fact, not an empty state: one muted line, the weight `QuietDay`
  // gives a day the ledger has nothing for.
  nothingHere: { color: theme.textMuted, textAlign: "center", ...text.ui("body") },
  unpriced: { color: theme.textMuted, ...text.ui("caption") },
}));
