/**
 * `<YearPicker>` — nine years at a time, paged back to 1900 (S04 §3).
 *
 * **The same sheet `PeriodPicker` uses for months, at year granularity.** A
 * reader who has chosen a month has already met this object; the only thing
 * that differs is what the grid holds and that the grid pages.
 *
 * **Paged, not scrolled.** S04's own four pages are swiped, so a grid inside
 * it that scrolled would be a second gesture for the same kind of move. The
 * arrows do the same step for a thumb that would rather tap, and the range
 * between them says where you are — which is what fourteen pages of years
 * needs instead of fourteen dots.
 *
 * **A dot marks a year the ledger holds something in.** Paging back through
 * empty decades is then visibly empty rather than ambiguous: *nothing here* and
 * *not loaded* look the same without it.
 *
 * **The back arrow goes quiet at 1900 rather than disappearing.** A control
 * that vanishes leaves a reader wondering what they did; one that dims says the
 * move is spent. `year-pages.ts` owns where the floor is and why.
 */

import { memo, useCallback } from "react";
import { Pressable, Text, View } from "react-native";
import { useT } from "../../../i18n/provider";
import { useInteraction } from "../../../primitives/interaction.ts";
import { text } from "../../../theme/fonts.ts";
import { useTheme } from "../../../theme/provider";
import { makeStyles } from "../../../theme/styles.ts";
import { focus, radius, space, touchTarget } from "../../../tokens.ts";
import { CaretLeftIcon, CaretRightIcon } from "../../phosphor";
import { BottomSheet } from "../bottom-sheet/bottom-sheet";

const ICON = 18;

/**
 * The page on screen, restated here rather than imported.
 *
 * **`packages/ui` may not name `@waltning/client`** — the direction is one-way
 * and `tests/module-boundaries.test.ts` holds it. The model lives in
 * `transactions/year-pages`, which owns where the floor is and how pages are
 * counted; this is the shape it hands over, and the caller does the stepping.
 */
export type YearPageView = {
  years: readonly number[];
  label: string;
  hasOlder: boolean;
  hasNewer: boolean;
};

export type YearPickerProps = {
  visible: boolean;
  page: YearPageView;
  /** The year the pager is on, marked in the grid. */
  current: number;
  /** Years the ledger holds something in. Everything else is drawn quiet. */
  withEntries: ReadonlySet<number>;
  onOlder: () => void;
  onNewer: () => void;
  onPick: (year: number) => void;
  onDismiss: () => void;
};

function YearCell({
  year,
  selected,
  hasEntries,
  onPick,
}: {
  year: number;
  selected: boolean;
  hasEntries: boolean;
  onPick: (year: number) => void;
}) {
  const styles = useStyles();
  const { focused, handlers } = useInteraction();
  const press = useCallback(() => onPick(year), [onPick, year]);
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={String(year)}
      // Flat as well as in the state object: `react-native-web` maps neither
      // `accessibilityState.selected` nor the native pair, so without it the
      // web build announces nine identical buttons.
      accessibilityState={{ selected }}
      {...(selected ? SELECTED : UNSELECTED)}
      onPress={press}
      {...handlers}
      style={[styles.cell, selected ? styles.cellSelected : null, focused ? styles.focused : null]}
    >
      <Text style={[styles.cellLabel, selected ? styles.cellLabelSelected : null]}>{year}</Text>
      {/*
        Decorative: the cell's accessible name is the year, and whether it holds
        anything is what the screen behind this sheet is for.
      */}
      <View
        {...HIDDEN}
        style={[
          styles.mark,
          hasEntries ? (selected ? styles.markOnSelected : styles.markHeld) : null,
        ]}
      />
    </Pressable>
  );
}

const MemoYearCell = memo(YearCell);

function YearPickerView({
  visible,
  page,
  current,
  withEntries,
  onOlder,
  onNewer,
  onPick,
  onDismiss,
}: YearPickerProps) {
  const t = useT();
  const styles = useStyles();
  const ink = useTheme().text;
  const dim = useTheme().textFaint;

  return (
    <BottomSheet visible={visible} title={t("shell.pickYear")} onDismiss={onDismiss}>
      <View style={styles.pageRow}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={t("shell.earlierYears")}
          accessibilityState={{ disabled: !page.hasOlder }}
          disabled={!page.hasOlder}
          onPress={onOlder}
          style={styles.step}
        >
          <CaretLeftIcon size={ICON} color={page.hasOlder ? ink : dim} />
        </Pressable>
        {/*
          A heading, not a label: it names what the grid below holds, and a
          reader arriving in the sheet should hear which nine years they are
          choosing within before they hear nine numbers.
        */}
        <Text accessibilityRole="header" style={styles.range}>
          {page.label}
        </Text>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={t("shell.laterYears")}
          accessibilityState={{ disabled: !page.hasNewer }}
          disabled={!page.hasNewer}
          onPress={onNewer}
          style={styles.step}
        >
          <CaretRightIcon size={ICON} color={page.hasNewer ? ink : dim} />
        </Pressable>
      </View>

      <View style={styles.grid}>
        {page.years.map((year) => (
          <MemoYearCell
            key={year}
            year={year}
            selected={year === current}
            hasEntries={withEntries.has(year)}
            onPick={onPick}
          />
        ))}
      </View>

      <Text style={styles.note}>
        {page.hasOlder ? t("shell.yearsMore") : t("shell.yearsFloor")}
      </Text>
    </BottomSheet>
  );
}

export const YearPicker = memo(YearPickerView);

/** `react-native-web` maps neither flag, so both need their flat forms. */
const SELECTED: { "aria-selected": true } = { "aria-selected": true };
const UNSELECTED: { "aria-selected": false } = { "aria-selected": false };
const HIDDEN: { "aria-hidden": true } = { "aria-hidden": true };

const useStyles = makeStyles((theme) => ({
  pageRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  step: {
    minWidth: touchTarget.min,
    minHeight: touchTarget.min,
    alignItems: "center",
    justifyContent: "center",
  },
  range: { ...text.ui("label"), color: theme.text },
  grid: { flexDirection: "row", flexWrap: "wrap", gap: space.md },
  cell: {
    // Three across, whatever the page holds. `flexBasis` sets the column;
    // `flexGrow: 0` is what keeps it — the oldest page can hold a single year,
    // and a cell allowed to grow makes that one year a full-width slab.
    flexBasis: "30%",
    flexGrow: 0,
    minHeight: touchTarget.min + space.xl,
    alignItems: "center",
    justifyContent: "center",
    gap: space.xs,
    borderRadius: radius.sm,
    backgroundColor: theme.subtleFill,
  },
  cellSelected: { backgroundColor: theme.accent },
  focused: {
    outlineWidth: focus.width,
    outlineColor: theme.focusRing,
    outlineOffset: focus.offset,
  },
  cellLabel: { ...text.display("bodySm"), color: theme.text },
  cellLabelSelected: { color: theme.textOnAccent },
  mark: { width: 4, height: 4, borderRadius: radius.xs },
  markHeld: { backgroundColor: theme.accentIcon },
  markOnSelected: { backgroundColor: theme.textOnAccent },
  note: { ...text.ui("caption"), color: theme.textMuted },
}));
