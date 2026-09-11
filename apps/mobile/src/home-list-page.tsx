import type {
  PhoneLedgerController,
  PhoneSearchTransaction,
} from "@waltning/client/ledger/create-phone-ledger";
import type { ListStartGate } from "@waltning/client/ledger/list-start-gate";
import { listStartGate } from "@waltning/client/ledger/list-start-gate";
import { useLedgerList } from "@waltning/client/ledger/use-ledger-list";
import { ribbonDays, toLedgerItems } from "@waltning/client/transactions/ledger-days";
import type { AccountingDate } from "@waltning/core/date";
import type { CurrencyCode, Money } from "@waltning/core/money";
import { Amount } from "@waltning/ui/fx/amount";
import { dayLabel, dayRangeLabel, weekdayInitial } from "@waltning/ui/i18n/locales";
import { useLocale, useT } from "@waltning/ui/i18n/provider";
import { pageScrollProps } from "@waltning/ui/primitives/nested-scroll";
import { GroundPanel, type ScrollHandler } from "@waltning/ui/shell/card";
import { useGroundInset } from "@waltning/ui/shell/ground-inset";
import { TodayPill } from "@waltning/ui/shell/today-pill";
import { text } from "@waltning/ui/theme/fonts";
import { makeStyles } from "@waltning/ui/theme/styles";
import { type DayRowPlace, DayRowSurface } from "@waltning/ui/transactions/day-group";
import { DayHeader } from "@waltning/ui/transactions/day-header";
import {
  DayRibbon,
  type RibbonDay,
} from "@waltning/ui/transactions/molecules/day-ribbon/day-ribbon";
import { LedgerRowItem } from "@waltning/ui/transactions/molecules/ledger-row-item/ledger-row-item";
import { QuietDay, QuietRun } from "@waltning/ui/transactions/molecules/quiet-days/quiet-days";
import { memo, useCallback, useMemo, useRef } from "react";
import { Text, View, type ViewToken } from "react-native";
import Animated from "react-native-reanimated";

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
  /** Where the list is centred. A change is a jump: both halves reload (S04 §6). */
  anchor: AccountingDate;
  /** The device's own today, which stays marked wherever the list has scrolled. */
  today: AccountingDate;
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

type DayTotal =
  | { pivot: Money; approximate: boolean }
  /** No rate arrived — the dash, with its reason. */
  | { pivot: null }
  /** A filtered day, which has no figure of its own. Nothing is drawn at all. */
  | { pivot: "filtered" };

type Entry =
  | { key: string; kind: "day"; label: string; total: DayTotal }
  | { key: string; kind: "row"; row: PhoneSearchTransaction; place: DayRowPlace }
  | { key: string; kind: "quiet"; label: string }
  | { key: string; kind: "run"; label: string; days: number; from: string };

export function HomeListPage({
  ledger,
  anchor,
  today,
  pivotCurrency,
  pivotDecimals,
  onPickDay,
  onOpenTransaction,
  onCategorize,
  onReturnToToday,
  query,
  onScroll,
  empty,
}: HomeListPageProps) {
  const t = useT();
  const locale = useLocale();
  // A new object per render would re-key the list and discard both halves on
  // every keystroke — `useLedgerList` treats a filter change as a jump, which
  // is right for a *different* filter and ruinous for an identical one.
  const filter = useMemo(() => (query === null ? undefined : { text: query }), [query]);
  const { rows, hasOlder, hasNewer, loadOlder, loadNewer } = useLedgerList(ledger, {
    anchor,
    today,
    filter,
  });
  const items = useMemo(
    // A filtered set has no gaps to explain and no day totals to state —
    // `ledger-days`' own `filtered` option carries the whole argument.
    () => toLedgerItems(rows, pivotCurrency, { filtered: query !== null }),
    [rows, pivotCurrency, query],
  );

  const days = useMemo<readonly RibbonDay[]>(
    () =>
      ribbonDays(items, { filtered: query !== null }).map((day) => ({
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
    [items, locale, query, t, today],
  );

  const entries = useMemo<readonly Entry[]>(() => {
    const out: Entry[] = [];
    for (const item of items) {
      if (item.kind === "quiet") {
        // `from` is the newer end and `to` the older one — the list runs
        // backwards, and a span written the other way round would read as a
        // range nobody could find.
        out.push(
          item.days === 1
            ? { key: `quiet-${item.from}`, kind: "quiet", label: dayLabel(item.from, locale) }
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
        const place: DayRowPlace =
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

  const renderItem = useCallback(
    ({ item }: { item: Entry }) => {
      switch (item.kind) {
        case "row":
          return (
            <DayRowSurface place={item.place}>
              <ListRow row={item.row} onOpen={onOpenTransaction} onCategorize={onCategorize} />
            </DayRowSurface>
          );
        case "quiet":
          return <QuietDay label={item.label} emptyLabel={t("transactions.nothingThatDay")} />;
        case "run":
          return <QuietRunItem entry={item} onPickDay={onPickDay} />;
        default:
          return (
            <DayHeader
              label={item.label}
              total={
                <DayTotalFigure
                  total={item.total}
                  currency={pivotCurrency}
                  decimals={pivotDecimals}
                />
              }
            />
          );
      }
    },
    [onOpenTransaction, onCategorize, onPickDay, pivotCurrency, pivotDecimals, t],
  );

  const keyExtractor = useCallback((entry: Entry) => entry.key, []);
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
  const listKey = `${anchor}|${query ?? ""}`;
  const lastKey = useRef(listKey);
  if (lastKey.current !== listKey) {
    lastKey.current = listKey;
    gate.current.reset();
  }
  // Ref-stable: `FlatList` refuses a changing `onViewableItemsChanged`, and
  // this one closes over nothing but a ref.
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

  const styles = useStyles();
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
  // **There are three emptinesses here and only one of them is the ledger's.**
  // The screen's `empty` is S04 §6's *no transactions* — a claim about the
  // whole ledger, with a first capture offered — and it is right for exactly
  // one of the three:
  //
  // - **Searching.** §6's *Empty · filtered*: the ledger holds rows, this query
  //   does not match them. The first-run wording here would tell a reader with
  //   a full ledger that they have never captured anything, because they typed
  //   a word.
  // - **Jumped behind the ledger's own beginning.** The reader has rows; they
  //   are all newer than where they are standing, one tap away on the pill
  //   above.
  // - **Anchored on today with nothing anywhere.** The ledger really is empty,
  //   and a first capture is the thing to offer.
  //
  // Which one it is is a question about *this page's* two parameters, the query
  // and the anchor, so this is the part of the empty state the page decides and
  // the screen cannot.
  const emptyElement = useMemo(
    () => (
      <View style={styles.empty}>
        {query !== null ? (
          <Text style={styles.nothingHere}>{t("transactions.noMatchesHere", { query })}</Text>
        ) : anchor === today ? (
          empty
        ) : (
          <Text style={styles.nothingHere}>
            {t("transactions.nothingOnOrBefore", { date: dayLabel(anchor, locale) })}
          </Text>
        )}
      </View>
    ),
    [anchor, today, query, empty, locale, t, styles.empty, styles.nothingHere],
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
      <DayRibbon days={days} current={anchor} onPickDay={onPickDay} />
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
          data={entries}
          renderItem={renderItem}
          keyExtractor={keyExtractor}
          ListEmptyComponent={emptyElement}
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
            onPress={onReturnToToday}
          />
        )}
      </View>
    </GroundPanel>
  );
}

/**
 * One row, and the two gestures S04 §7 gives it.
 *
 * **A component rather than two arrows in `renderItem`.** `architecture/11`
 * refuses an inline function in JSX, and this row is why the rule exists: a
 * fresh pair per render would make `LedgerRowItem`'s `memo` compare unequal on
 * every scroll frame and re-render every visible row.
 *
 * `LedgerRowItem` decides *whether* the row swipes — a transfer and an
 * adjustment have no category by constraint — so the kind read here is only
 * ever the kind that reaches the sheet.
 */
function ListRowView({
  row,
  onOpen,
  onCategorize,
}: {
  row: PhoneSearchTransaction;
  onOpen: (id: string) => void;
  onCategorize: (id: string, kind: "income" | "expense") => void;
}) {
  const kind = row.type === "income" ? "income" : "expense";
  const categorize = useCallback((id: string) => onCategorize(id, kind), [onCategorize, kind]);
  return (
    <LedgerRowItem
      row={row}
      // The group's header already gave the date. S10's desk table is the list
      // that needs it per row, because it does not group by day.
      withDate={false}
      onPress={onOpen}
      onShortSwipe={categorize}
      // Long swipe is *edit*, and editing a row is opening it — S09 is where
      // every field of it lives, so a second editor here would be a second
      // place the same row can be changed.
      onLongSwipe={onOpen}
    />
  );
}

const ListRow = memo(ListRowView);

/**
 * A collapsed run, with its own handler.
 *
 * `.bind()` and an arrow inside JSX are both refused (`architecture/11`), and
 * for a reason this row shows plainly: a fresh function per render would make
 * `QuietRun`'s `memo` compare unequal every time and re-render every collapsed
 * run in the list on any change at all.
 */
function QuietRunItem({
  entry,
  onPickDay,
}: {
  entry: { label: string; days: number; from: string };
  onPickDay: (date: string) => void;
}) {
  const t = useT();
  const from = entry.from;
  // Showing a run is going to it: the list draws every day it holds, so this
  // is a move rather than a mode.
  const show = useCallback(() => onPickDay(from), [onPickDay, from]);
  return (
    <QuietRun
      label={entry.label}
      summary={t(entry.days === 1 ? "transactions.quietRunOne" : "transactions.quietRunMany", {
        count: entry.days,
      })}
      showLabel={t("shell.show")}
      onShow={show}
    />
  );
}

/**
 * A day's figure, or the stated absence of one.
 *
 * **A day the ledger could not price shows no figure at all** (S04 §5). One
 * that added only the legs it could price would be a smaller number presented
 * as the day's own — the failure that looks like health. The dash says there
 * is no honest figure, which is a different claim from zero.
 */
function DayTotalFigure({
  total,
  currency,
  decimals,
}: {
  total: DayTotal;
  currency: CurrencyCode;
  decimals: number;
}) {
  // Nothing at all, not a dash: a dash is `UnpricedDay`'s and carries *a rate
  // has not arrived*, which is a wrong reason attached to a right blank.
  if (total.pivot === "filtered") return null;
  if (total.pivot === null) return <UnpricedDay />;
  return (
    <Amount
      value={total.pivot}
      currency={currency}
      decimals={decimals}
      /*
        **12/600 and in its own colour, which is what every board draws.**
        `compact` is `displayThree` at 17 — larger than the 14.5 rows beneath
        it, so the day's summary outweighed the entries it summarises. And
        muted made this the one day total in the app without a direction.
      */
      size="caption"
      /*
        **`net`, not `auto`.** A day's total is a flow, not a balance: money
        that came in that day *is* income, and `auto` left it in plain ink
        while the spend day two rows above it was red — the reader is told
        which days cost them something and nothing at all about the days that
        paid. `auto` is right where a positive number is what you *have*;
        `<Amount>`'s own `net` is where a positive number is what *came in*,
        and it is the same green every other inflow figure in the app draws.
        A day that nets to zero with rows on it is a day of transfers between
        your own accounts, and `net` mutes it — the figure's half of what
        `DayCell` already marks `flat`.
      */
      kind="net"
    />
  );
}

/** The dash. Not a `DayHeader` — this sits *inside* one. */
function UnpricedDay() {
  const styles = useStyles();
  const t = useT();
  return (
    <Text accessibilityLabel={t("transactions.noTotalToday")} style={styles.unpriced}>
      —
    </Text>
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
  // A stated fact, not an empty state: one muted line, the weight `QuietDay`
  // gives a day the ledger has nothing for.
  nothingHere: { color: theme.textMuted, textAlign: "center", ...text.ui("body") },
  unpriced: { color: theme.textMuted, ...text.ui("caption") },
}));
