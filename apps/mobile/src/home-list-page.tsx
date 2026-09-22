import type { PhoneLedgerController } from "@waltning/client/ledger/create-phone-ledger";
import type { ListStartGate } from "@waltning/client/ledger/list-start-gate";
import { listStartGate } from "@waltning/client/ledger/list-start-gate";
import { useLedgerList } from "@waltning/client/ledger/use-ledger-list";
import { reanchors } from "@waltning/client/ledger/use-ledger-list/anchor-echo";
import {
  blockOf,
  correctionFor,
  type EntryHeights,
  ESTIMATED_HEIGHTS,
  type GeometryEntry,
  listGeometry,
} from "@waltning/client/ledger/use-ledger-list/list-geometry";
import {
  type RibbonDayModel,
  ribbonCell,
  ribbonDate,
  ribbonDayOn,
  ribbonMarks,
  ribbonRun,
  toLedgerItems,
} from "@waltning/client/transactions/ledger-days";
import { type AccountingDate, accountingDate, yearMonth } from "@waltning/core/date";
import type { CurrencyCode } from "@waltning/core/money";
import { dayLabel, dayRangeLabel, monthShort, weekdayInitial } from "@waltning/ui/i18n/locales";
import { useLocale, useT } from "@waltning/ui/i18n/provider";
import { useScrollSettle } from "@waltning/ui/primitives/use-scroll-settle";
import { GroundPanel } from "@waltning/ui/shell/card";
import { useGroundInset } from "@waltning/ui/shell/ground-inset";
import { TodayPill } from "@waltning/ui/shell/today-pill";
import { text } from "@waltning/ui/theme/fonts";
import { makeStyles } from "@waltning/ui/theme/styles";

import {
  DayRibbon,
  type RibbonDay,
} from "@waltning/ui/transactions/molecules/day-ribbon/day-ribbon";
import {
  blockAt,
  EMPTY_PLACEMENT,
  type StripPlacement,
} from "@waltning/ui/transactions/molecules/day-ribbon/scrub";
import {
  type DayRowPlaceName,
  dateOfEntry,
  type ListEntry,
} from "@waltning/ui/transactions/molecules/list-entry/entry";
import type { ListEntryHandlers } from "@waltning/ui/transactions/molecules/list-entry/list-entry";
import { LedgerScroller } from "@waltning/ui/transactions/organisms/ledger-scroller/ledger-scroller";
import { memo, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { type FlatList, Text, View, type ViewToken } from "react-native";
import {
  runOnJS,
  type SharedValue,
  useAnimatedScrollHandler,
  useSharedValue,
} from "react-native-reanimated";

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
   * `ribbonMarks` as their `filtered` option too. §7 says the day grouping
   * survives; it is the *rules about what the gaps mean* that do not.
   */
  query: string | null;
  /**
   * The screen's shared offset, which the header collapses from.
   *
   * **Written here, read there — and not the value this page's own strip and
   * settle use.** All four pages are mounted at once and all four write this
   * one number, so anything that interprets it through *this* page's day
   * positions is reading someone else's gesture. Scrolling Summary dragged the
   * off-screen strip, and swiping back to List then reported a day nobody had
   * scrolled to, because the offset had moved while this page had not. This
   * page keeps its own copy (`listY` below) for everything that means *where
   * the list is*, and writes this one purely so the header keeps collapsing.
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
   *
   * **A shared value, because only a worklet reads it.** As a boolean prop it
   * re-rendered this page and every mounted cell on each swipe between pages.
   */
  active: SharedValue<boolean>;
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

const EMPTY = { tops: [], marks: [], dates: [] } as const;

function HomeListPageView({
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
        ? // **`centred`, not `anchor`.** The list is *built around* `centred`,
          // which moves only on a real jump; `anchor` also moves every time a
          // scroll settles. Keyed on the anchor, every stop rebuilt every
          // entry as a fresh object, which failed every cell's `memo` — the
          // render probe counted ~2,000 re-renders per settle, every cell in
          // the list about five times over.
          toLedgerItems(rows, pivotCurrency, { filtered: query !== null, anchor: centred })
        : [],
    [rows, settled, pivotCurrency, query, centred],
  );

  /**
   * **The day this list is showing — held here, not in the route.**
   *
   * A scroll settling, a tap on a loaded day, the pill: each moves *this* and
   * tells the screen, which only notes it (`use-pager-route.ts`). Writing the
   * route instead re-rendered the whole navigation tree per stop. The route's
   * `anchor` still wins whenever it moves, because that is a deliberate act
   * from somewhere else.
   */
  const [shown, setShown] = useState<AccountingDate>(anchor);
  useEffect(() => setShown(anchor), [anchor]);

  /**
   * **The strip's run: every day from a fixed origin to today and past it**
   * (`ledger-days.ts`'s `ribbonRun`). A cell's index is the number of days
   * since the origin, so nothing here is clamped or re-cut as the reader
   * moves, and the strip under a thumb has no end to meet. Under a search the
   * strip is the matched days and nothing else — not continuous, because a gap
   * between two matches says nothing about the ledger.
   */
  const filtered = query !== null;
  const marks = useMemo(
    () => ribbonMarks(items, { filtered, anchor: centred }),
    [items, filtered, centred],
  );
  // The origin only ever moves back (`ribbonRun`'s `floor`): coming home from
  // a jump to 1950 must not re-index the strip a second time.
  const floor = useRef<AccountingDate | undefined>(undefined);
  const run = useMemo(() => {
    const next = ribbonRun(today, { oldest: marks.from, newest: marks.to, floor: floor.current });
    floor.current = next.origin;
    return next;
  }, [today, marks.from, marks.to]);
  const stripCount = filtered ? marks.days.length : run.count;

  /**
   * One cell's day, asked for when the cell is drawn.
   *
   * **Remembered per cell**, because the strip's cells are memoised on the
   * object they are handed and the list asks again on every window it draws.
   * The memory lasts as long as what it was built from.
   */
  const dayAt = useMemo(() => {
    const drawn = new Map<number, RibbonDay>();
    const draw = (day: RibbonDayModel): RibbonDay => ({
      date: day.date,
      day: Number(day.date.slice(8, 10)),
      // **The 1st says its month, and 1 January its year** (S04 §4). A strip
      // with no end is a run of bare numbers two years from anything that
      // names them; the first of a month is where a reader looks for which.
      weekday: !day.date.endsWith("-01")
        ? weekdayInitial(day.date, locale)
        : day.date.endsWith("-01-01")
          ? day.date.slice(0, 4)
          : monthShort(yearMonth(day.date.slice(0, 7)), locale),
      activity: day.activity,
      direction: day.direction,
      ...(day.date === today ? { today: true } : {}),
      ...(day.date > today ? { ahead: true } : {}),
      ...(day.generated === true ? { generated: true } : {}),
      // The full date and what happened, never the bare number the eye
      // reads: a run of them says nothing about which month or which year.
      // **`entries` is the *loaded* rows, which is a third reading of the
      // search and disagrees with the other two.** A day holding forty
      // matches renders thirty of them in one page, so "30 entries" would
      // stand under a grid cell reading 40. Under a filter the cell says it
      // matched and leaves the counting to the pages built to count.
      // **An unread day says its date and no more**: "nothing" would be a
      // claim about a day the list has never loaded.
      label: filtered
        ? t("transactions.ribbonDayMatched", { date: dayLabel(day.date, locale) })
        : day.activity === "unread"
          ? dayLabel(day.date, locale)
          : day.entries === 0
            ? t("transactions.ribbonDayEmpty", { date: dayLabel(day.date, locale) })
            : t(day.entries === 1 ? "transactions.ribbonDayOne" : "transactions.ribbonDayMany", {
                date: dayLabel(day.date, locale),
                count: day.entries,
              }),
    });
    return (cell: number): RibbonDay => {
      const seen = drawn.get(cell);
      if (seen !== undefined) return seen;
      const model = filtered
        ? (marks.days[cell] ?? marks.days.at(-1))
        : ribbonDayOn(ribbonDate(cell, run), marks, today);
      // Only under a search with no matches, where the strip draws no cell to
      // ask about: answered with today rather than with a throw.
      const day = draw(model ?? ribbonDayOn(today, marks, today));
      drawn.set(cell, day);
      return day;
    };
  }, [filtered, marks, run, today, locale, t]);

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
    if (!filtered) {
      // Arithmetic: a day's cell is how far it is from the run's first day.
      // Only a day before the origin has none, and the origin is ten years
      // behind the oldest day this list has heard of.
      return (date: string): number => {
        const cell = ribbonCell(accountingDate(date), run);
        return cell < 0 ? 0 : cell;
      };
    }
    const at = new Map(marks.days.map((day, index) => [day.date as string, index]));
    const first = marks.days[0]?.date ?? "";
    const last = marks.days.length - 1;
    return (date: string): number => {
      const found = at.get(date);
      if (found !== undefined) return found;
      // Not a matched day: the nearer end, which keeps the marks monotonic.
      return date < first ? 0 : last < 0 ? 0 : last;
    };
  }, [filtered, marks.days, run]);

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
  /**
   * Heights of entries that are **not** their kind's height — a transfer draws
   * two accounts, a foreign row its rate — by entry key.
   *
   * A ref plus a counter, and the counter only moves for an entry that really
   * is odd: the ordinary row, which is nearly all of them, matches its kind
   * and costs nothing. `listGeometry` reads this before it reads the table.
   */
  const odd = useRef(new Map<string, number>());
  const [oddSeen, setOddSeen] = useState(0);
  const kindHeights = useRef(heights);
  kindHeights.current = heights;
  const measuredKinds = useRef(new Set<keyof EntryHeights>());

  const noteHeight = useCallback((key: keyof EntryHeights, height: number, entry: string) => {
    // **To a hundredth, not to a point.** A hairline is a third of a point on
    // a 3x phone, and rounding each row threw that away per row — a hundred
    // points over three hundred rows, which is a day on the strip. A hundredth
    // is only there to stop float noise reading as a new height.
    const found = Math.round(height * 100) / 100;
    // **Written as *not greater than zero*, because `NaN <= 0` is `false`.**
    if (!(found > 0)) return;
    if (!measuredKinds.current.has(key)) {
      // The first of its kind sets the kind's height.
      measuredKinds.current.add(key);
      setHeights((seen) => (seen[key] === found ? seen : { ...seen, [key]: found }));
      return;
    }
    const usual = kindHeights.current[key];
    const was = odd.current.get(entry);
    if (Math.abs(found - usual) < 0.02) {
      if (was !== undefined) {
        odd.current.delete(entry);
        setOddSeen((seen) => seen + 1);
      }
      return;
    }
    if (was === found) return;
    odd.current.set(entry, found);
    setOddSeen((seen) => seen + 1);
  }, []);

  const shape = useMemo<readonly GeometryEntry[]>(
    () =>
      entries.map((entry) => ({
        kind: entry.kind,
        date: dateOfEntry(entry),
        ...(entry.kind === "day" ? { first: entry.first } : {}),
        ...(entry.kind === "row" ? { place: entry.place } : {}),
        key: entry.key,
      })),
    [entries],
  );
  /**
   * **This page's own offset**, written by this page's own scroller and by
   * nothing else. The screen's `scrollY` is shared by four mounted pages; this
   * one means *where the list is*, which is the only thing the strip and the
   * settle can honestly be a function of.
   *
   * One handler writing two values, rather than two handlers on one scroller —
   * `list-start-gate.ts` is right that those do not compose.
   */
  const listY = useSharedValue(0);
  /** The scroll to a day that is still being finished (`finish`, below). */
  const sent = useRef<{ date: string; at: number; legs: number } | null>(null);
  /** A finger on the list ends it at once: the list is the reader's. */
  const dropSent = useCallback(() => {
    sent.current = null;
  }, []);

  const handleScroll = useAnimatedScrollHandler(
    {
      onBeginDrag: () => {
        runOnJS(dropSent)();
      },
      onScroll: (event) => {
        listY.value = event.contentOffset.y;
        scrollY.value = event.contentOffset.y;
      },
    },
    [listY, scrollY, dropSent],
  );

  const geometry = useMemo(
    // `oddSeen` is what says the map changed; the map itself is a ref so that
    // an ordinary row being measured re-renders nothing.
    () => (oddSeen >= 0 ? listGeometry(shape, heights, cellOf, 0, odd.current) : EMPTY),
    [shape, heights, cellOf, oddSeen],
  );
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
  /**
   * **A scroll to a day is checked on arrival, and finished**
   * (`list-geometry.ts`'s `correctionFor`). A day's offset is a guess until
   * the rows above it have been drawn, and getting there is what draws them.
   * `true` while it is still on its way — the day it paused on is not reported.
   */
  const finish = useCallback(
    (at: number): boolean => {
      const last = sent.current;
      if (last === null) return false;
      const top = correctionFor(last.date, at, geometry, Date.now() - last.at);
      // Four legs, because each draws rows the one before could not see; past
      // that the day is against the end of the list and cannot reach the top.
      if (top === null || last.legs >= 4) {
        sent.current = null;
        return false;
      }
      sent.current = { date: last.date, at: Date.now(), legs: last.legs + 1 };
      list.current?.scrollToOffset({ offset: top, animated: true });
      return true;
    },
    [geometry],
  );
  const reportSettled = useCallback(
    (at: number) => {
      if (finish(at)) return;
      // **`dayAt`, never the strip's cell.** The strip clamps every day past
      // its reach onto its end cell, so reading the day back out of it named a
      // real date that was not the one on screen — out by a month on a list
      // holding a collapsed run, and silent, because a settle fires once per
      // stop and the wrong anchor is then quietly accepted.
      // **`blockAt`, the strip's own rule** — so the day that is named and the
      // day the ring lands on cannot disagree, and both are the day the reader
      // is *looking at* rather than the one a sliver of which is still under
      // the top edge.
      const landed = geometry.dates[blockAt(at, geometry.tops)];
      if (landed === undefined || landed === reported.current) return;
      reported.current = landed;
      setShown(accountingDate(landed));
      visibleDayRef.current?.(accountingDate(landed));
    },
    [geometry, finish],
  );
  useScrollSettle(listY, reportSettled, active);

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
   * **Go to a day that is already in the list — by offset, and quietly.**
   *
   * By *offset* because `scrollToIndex` needs every cell between here and
   * there laid out, and a virtualised list has not laid them out: it failed,
   * fell back to an average row height, landed a day or two off — and the
   * settle then reported *that* day, so a tap on the 16th selected the 14th.
   * The geometry already knows where each day's block starts.
   *
   * *Quietly* because a day that is on the list is not a jump: nothing is
   * re-read and the route is not written, so a tap costs a scroll rather than
   * four commits of the whole navigation tree. `false` when the day is not in
   * the list, and then the caller jumps.
   */
  const goTo = useCallback(
    (date: string): boolean => {
      const index = blockOf(date, geometry.dates);
      const top = index < 0 ? undefined : geometry.tops[index];
      if (top === undefined) return false;
      reported.current = date;
      setShown(accountingDate(date));
      visibleDayRef.current?.(accountingDate(date));
      sent.current = { date, at: Date.now(), legs: 0 };
      list.current?.scrollToOffset({ offset: top, animated: true });
      return true;
    },
    [geometry],
  );

  /**
   * `TodayPill`: a scroll when today is on the list as a day, a jump home when
   * it is not.
   *
   * **A day, not a place.** `blockOf` finds a day inside a collapsed run, which
   * is right for a tap on the strip — the run is where that day is drawn — and
   * wrong for the pill, whose promise is *the list on today*. A list led past
   * today draws today inside a *nothing recorded* run named by its newer end:
   * scrolled there, the ring landed on that end, the settle reported it, and
   * the pill stayed up over a list that could not reach today. The jump
   * re-anchors, and the anchor is always its own item.
   */
  const returnToToday = useCallback(() => {
    const ownBlock = geometry.dates[blockOf(today, geometry.dates)] === today;
    if (!ownBlock || !goTo(today)) onReturnToToday();
  }, [geometry, goTo, today, onReturnToToday]);

  /** A tap on the strip, the same way (S04 §7). */
  const pickDay = useCallback(
    (date: string) => {
      if (!goTo(date)) onPickDay(date);
    },
    [goTo, onPickDay],
  );

  // Read through a ref: `shown` changes on every settle, and as a dependency
  // it handed the strip a new prop — and re-rendered all of it — per stop.
  const shownRef = useRef(shown);
  shownRef.current = shown;
  /** The strip, left on a day by hand: the list goes there, as for a tap (§7). */
  const leadTo = useCallback(
    (cell: number) => {
      const date = dayAt(cell).date;
      if (date !== shownRef.current) pickDay(date);
    },
    [dayAt, pickDay],
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
    // **An approximation, finished like any other scroll to a day.** By index
    // the list lands from average row heights, and a jump to a quiet day came
    // to rest on the busier day above it — the ring on 4 November for a jump
    // to 29 October. The settle checks it against the measured geometry.
    sent.current = { date: anchor, at: Date.now(), legs: 0 };
    list.current?.scrollToIndex({ index: anchorIndex, animated: false, viewPosition: 0 });
  }, [anchorIndex, listKey, anchor]);
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
        count={stripCount}
        dayAt={dayAt}
        fill={!filtered}
        start={cellOf(anchor)}
        current={shown}
        scrollY={listY}
        placement={placement}
        onPickDay={pickDay}
        onLead={leadTo}
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
        <LedgerScroller
          listRef={list}
          entries={entries}
          handlers={handlers}
          currency={pivotCurrency}
          decimals={pivotDecimals}
          onMeasure={noteHeight}
          empty={settled ? emptyElement : null}
          contentStyle={content}
          onScroll={handleScroll}
          onEndReached={handleEndReached}
          onStartReached={handleStartReached}
          onViewableItemsChanged={notedScroll.current}
          onScrollToIndexFailed={settleScroll}
        />
        {/*
          **After the list, so it paints over it**, and only when the anchor has
          moved: a pill offering *today* while the list is already on today is a
          control that does nothing, which is how a reader learns to stop
          believing it (§6).
        */}
        {shown === today ? null : (
          <TodayPill
            label={t("shell.today")}
            accessibilityLabel={t("transactions.backToToday", {
              date: dayLabel(shown, locale),
            })}
            onPress={returnToToday}
          />
        )}
      </View>
    </GroundPanel>
  );
}

/**
 * **Memoised, because the screen above re-renders for reasons this page does
 * not care about** — a tab press, a search keystroke, another page's state.
 * Every prop it takes is stable or genuinely its own, so the memo holds, and
 * the render probe pins that it does (`tools/e2e/specs/renders.spec.ts`).
 */
export const HomeListPage = memo(HomeListPageView);

const useStyles = makeStyles((theme) => ({
  root: { flex: 1 },
  // The box `TodayPill` resolves its `position: absolute` against, and the
  // reason it is a box at all — see the JSX. Its own style rather than a second
  // use of `list`: the two happen to want the same one rule and are not the
  // same thing, and the next person to change one must not silently change the
  // other.
  floatBox: { flex: 1 },
  content: { flexGrow: 1 },
  // Centred in the page it was given, not stacked at the top of it.
  empty: { flex: 1, justifyContent: "center" },
  // A stated fact, not an empty state: one muted line, the weight `QuietDay`
  // gives a day the ledger has nothing for.
  nothingHere: { color: theme.textMuted, textAlign: "center", ...text.ui("body") },
}));
