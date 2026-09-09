import type {
  PhoneLedgerController,
  PhoneSearchTransaction,
} from "@waltning/client/ledger/create-phone-ledger";
import { useLedgerList } from "@waltning/client/ledger/use-ledger-list";
import { ribbonDays, toLedgerItems } from "@waltning/client/transactions/ledger-days";
import type { AccountingDate } from "@waltning/core/date";
import type { CurrencyCode, Money } from "@waltning/core/money";
import { Amount } from "@waltning/ui/fx/amount";
import { dayLabel, weekdayInitial } from "@waltning/ui/i18n/locales";
import { useLocale, useT } from "@waltning/ui/i18n/provider";
import { pageScrollProps } from "@waltning/ui/primitives/nested-scroll";
import { GroundPanel, type ScrollHandler } from "@waltning/ui/shell/card";
import { useGroundInset } from "@waltning/ui/shell/ground-inset";
import { text } from "@waltning/ui/theme/fonts";
import { makeStyles } from "@waltning/ui/theme/styles";
import { DayHeader } from "@waltning/ui/transactions/day-header";
import {
  DayRibbon,
  type RibbonDay,
} from "@waltning/ui/transactions/molecules/day-ribbon/day-ribbon";
import { LedgerRowItem } from "@waltning/ui/transactions/molecules/ledger-row-item/ledger-row-item";
import { QuietDay, QuietRun } from "@waltning/ui/transactions/molecules/quiet-days/quiet-days";
import { useCallback, useMemo } from "react";
import { Text, View } from "react-native";
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

type DayTotal = { pivot: Money; approximate: boolean } | { pivot: null };

type Entry =
  | { key: string; kind: "day"; label: string; total: DayTotal }
  | { key: string; kind: "row"; row: PhoneSearchTransaction }
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
  onScroll,
  empty,
}: HomeListPageProps) {
  const t = useT();
  const locale = useLocale();
  const { rows, hasOlder, loadOlder } = useLedgerList(ledger, { anchor });
  const items = useMemo(() => toLedgerItems(rows, pivotCurrency), [rows, pivotCurrency]);

  const days = useMemo<readonly RibbonDay[]>(
    () =>
      ribbonDays(items).map((day) => ({
        date: day.date,
        day: Number(day.date.slice(8, 10)),
        weekday: weekdayInitial(day.date, locale),
        activity: day.activity,
        direction: day.direction,
        ...(day.date === today ? { today: true } : {}),
        ...(day.date > today ? { ahead: true } : {}),
        // The full date and what happened, never the bare number the eye
        // reads: a run of them says nothing about which month or which year.
        label:
          day.entries === 0
            ? t("transactions.ribbonDayEmpty", { date: dayLabel(day.date, locale) })
            : t(day.entries === 1 ? "transactions.ribbonDayOne" : "transactions.ribbonDayMany", {
                date: dayLabel(day.date, locale),
                count: day.entries,
              }),
      })),
    [items, locale, t, today],
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
                label: `${dayLabel(item.to, locale)} – ${dayLabel(item.from, locale)}`,
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
          item.total.kind === "unpriced"
            ? { pivot: null }
            : { pivot: item.total.pivot, approximate: item.total.approximate },
      });
      for (const row of item.rows) out.push({ key: row.id, kind: "row", row });
    }
    return out;
  }, [items, locale]);

  const renderItem = useCallback(
    ({ item }: { item: Entry }) => {
      switch (item.kind) {
        case "row":
          return <LedgerRowItem row={item.row} onPress={onOpenTransaction} />;
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
    [onOpenTransaction, onPickDay, pivotCurrency, pivotDecimals, t],
  );

  const keyExtractor = useCallback((entry: Entry) => entry.key, []);
  const handleEndReached = useCallback(() => {
    if (hasOlder) loadOlder();
  }, [hasOlder, loadOlder]);

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
  const emptyElement = useMemo(
    () => <View style={styles.empty}>{empty}</View>,
    [empty, styles.empty],
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
      <Animated.FlatList
        data={entries}
        renderItem={renderItem}
        keyExtractor={keyExtractor}
        ListEmptyComponent={emptyElement}
        // So the empty state has the page to sit in rather than a strip at the
        // top of one: with no rows the content is shorter than the scroller.
        contentContainerStyle={content}
        onEndReached={handleEndReached}
        onEndReachedThreshold={END_REACHED_THRESHOLD}
        onScroll={onScroll}
        // 16ms: the header interpolates from this, and the default reports
        // once per gesture — a header that jumps when the finger lifts.
        scrollEventThrottle={16}
        // The page's own vertical scroller, inside the pager's horizontal one.
        {...pageScrollProps(styles.list)}
      />
    </GroundPanel>
  );
}

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
  if (total.pivot === null) return <UnpricedDay />;
  return (
    <Amount
      value={total.pivot}
      currency={currency}
      decimals={decimals}
      size="compact"
      emphasis="muted"
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

const useStyles = makeStyles((theme) => ({
  root: { flex: 1 },
  list: { flex: 1 },
  content: { flexGrow: 1 },
  // Centred in the page it was given, not stacked at the top of it.
  empty: { flex: 1, justifyContent: "center" },
  unpriced: { color: theme.textMuted, ...text.ui("caption") },
}));
