/**
 * `<ListEntryCell>` — one cell of S04's List page, whichever of the four kinds
 * it is.
 *
 * **It exists because a `renderItem` switch is not a component.** The page's
 * one grew to eight dependencies — three handlers, two currency facts, the
 * translator, the stylesheet and a measurement callback — and every one of
 * them had to stay referentially stable or every visible row re-rendered on
 * the next scroll frame. That is a component's problem, and it is solved by
 * being one: the translator and the styles are read here, the handlers arrive
 * as one object, and `memo` has something to compare.
 *
 * **The four kinds are one component, not four exports.** They are alternatives
 * in one union — the list holds a mix of them and asks *what is this* exactly
 * once — so a caller choosing between four would be the switch again, moved.
 * What is inside is the atomic scale `architecture/11` allows within a module:
 * the row, the collapsed run and the day's figure are each their own
 * memoised piece, and each is private because nothing else draws one.
 */

import type { CurrencyCode } from "@waltning/core/money";
import { memo, type ReactNode, useCallback } from "react";
import { type LayoutChangeEvent, Text, View } from "react-native";
import { Amount } from "../../../fx/atoms/amount/amount";
import { useT } from "../../../i18n/provider";
import { text } from "../../../theme/fonts.ts";
import { makeStyles } from "../../../theme/styles.ts";
import { space } from "../../../tokens.ts";
import { DayRowSurface } from "../day-group/day-group";
import { DayHeader } from "../day-header/day-header";
import type { LedgerEntry as Row } from "../entry-row/ledger-entry.ts";
import { LedgerRowItem } from "../ledger-row-item/ledger-row-item";
import { QuietDay, QuietRun } from "../quiet-days/quiet-days";
import { type DayTotal, type EntryHeightKey, heightKeyOf, type ListEntry } from "./entry.ts";

/**
 * Everything a cell can ask the screen to do.
 *
 * **One object, memoised once by the caller.** Three separate props were three
 * chances to hand down a fresh function, and `memo` comparing one stable
 * object is both cheaper and harder to get wrong.
 */
export type ListEntryHandlers = {
  onOpenTransaction: (id: string) => void;
  onCategorize: (id: string, kind: "income" | "expense") => void;
  /** Going to a day — from a collapsed run's *Show*. */
  onPickDay: (date: string) => void;
};

export type ListEntryProps = {
  entry: ListEntry;
  handlers: ListEntryHandlers;
  currency: CurrencyCode;
  decimals: number;
  /**
   * How tall this kind is, reported the first time one is laid out.
   *
   * The strip above the list is scrubbed by positions computed from a table of
   * per-kind heights (`list-geometry.ts`), and measuring beats reading the
   * tokens: a day header scales with the font and a row does not, so a table
   * that assumed either would drift a few points per day into a whole cell
   * over a month. The callback returns on the second entry of each kind, so
   * five measurements at mount is the whole cost.
   */
  onMeasure: (key: EntryHeightKey, height: number, entry: string) => void;
};

function ListEntryView({ entry, handlers, currency, decimals, onMeasure }: ListEntryProps) {
  const styles = useStyles();
  const t = useT();
  const key = heightKeyOf(entry);
  const report = useCallback(
    (event: LayoutChangeEvent) => onMeasure(key, event.nativeEvent.layout.height, entry.key),
    [key, entry.key, onMeasure],
  );

  return (
    /*
      **A bare `View` with no style, so it changes no layout.** It is here to
      carry one `onLayout`; the four kinds below render four different
      components and only one of them is ours to add a prop to, so a wrapper
      asks nothing of any of them.
    */
    <View onLayout={report}>{body(entry, handlers, currency, decimals, styles, t)}</View>
  );
}

function body(
  entry: ListEntry,
  handlers: ListEntryHandlers,
  currency: CurrencyCode,
  decimals: number,
  styles: ReturnType<typeof useStyles>,
  t: ReturnType<typeof useT>,
): ReactNode {
  switch (entry.kind) {
    case "row":
      return (
        <DayRowSurface place={entry.place}>
          <ListRow row={entry.row} handlers={handlers} />
        </DayRowSurface>
      );
    case "quiet":
      return <QuietDay label={entry.label} emptyLabel={t("transactions.nothingThatDay")} />;
    case "run":
      return <QuietRunItem entry={entry} />;
    default:
      return (
        // The deck's 14 between one day's card and the next day's kicker, and 6
        // between the kicker and its card — the same two gaps `DayGroup` keeps,
        // kept here by the list because it renders rows not groups. The first
        // header sits under the ribbon and takes no extra room above.
        <View style={entry.first ? styles.firstDayHeader : styles.dayHeader}>
          <DayHeader
            label={entry.label}
            total={<DayTotalFigure total={entry.total} currency={currency} decimals={decimals} />}
          />
        </View>
      );
  }
}

export const ListEntryCell = memo(ListEntryView);

/**
 * One row, and the two gestures S04 §7 gives it.
 *
 * **A component rather than two arrows in JSX.** `architecture/11` refuses an
 * inline function there, and this row is why the rule exists: a fresh pair per
 * render would make `LedgerRowItem`'s `memo` compare unequal on every scroll
 * frame and re-render every visible row.
 *
 * `LedgerRowItem` decides *whether* the row swipes — a transfer and an
 * adjustment have no category by constraint — so the kind read here is only
 * ever the kind that reaches the sheet.
 */
function ListRowView({ row, handlers }: { row: Row; handlers: ListEntryHandlers }) {
  const kind = row.type === "income" ? "income" : "expense";
  const onCategorize = handlers.onCategorize;
  const categorize = useCallback((id: string) => onCategorize(id, kind), [onCategorize, kind]);
  return (
    <LedgerRowItem
      row={row}
      // The group's header already gave the date. S10's desk table is the list
      // that needs it per row, because it does not group by day.
      withDate={false}
      onPress={handlers.onOpenTransaction}
      onShortSwipe={categorize}
      // Long swipe is *edit*, and editing a row is opening it — S09 is where
      // every field of it lives, so a second editor here would be a second
      // place the same row can be changed.
      onLongSwipe={handlers.onOpenTransaction}
    />
  );
}

const ListRow = memo(ListRowView);

/** A collapsed run: the span and how long it is, on one quiet line. */
function QuietRunItem({ entry }: { entry: { label: string; days: number } }) {
  const t = useT();
  return (
    <QuietRun
      label={entry.label}
      summary={t(entry.days === 1 ? "transactions.quietRunOne" : "transactions.quietRunMany", {
        count: entry.days,
      })}
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
        while the spend day two rows above it was red. `auto` is right where a
        positive number is what you *have*; `net` is where a positive number is
        what *came in*, and it is the same green every other inflow figure in
        the app draws. A day that nets to zero with rows on it is a day of
        transfers between your own accounts, and `net` mutes it — the figure's
        half of what `DayCell` already marks `flat`.
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

const useStyles = makeStyles((theme) => ({
  dayHeader: { paddingTop: space.x2, paddingBottom: space.sm },
  firstDayHeader: { paddingBottom: space.sm },
  unpriced: { color: theme.textMuted, ...text.ui("caption") },
}));
