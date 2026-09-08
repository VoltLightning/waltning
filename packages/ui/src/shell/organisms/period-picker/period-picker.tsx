/**
 * `<PeriodPicker>` — what `PagerHeader`'s title opens (S04 §3).
 *
 * **A picker has to look like a picker.** The title was routed straight to the
 * Months page first, and rendered that read as a bug: tapping *September*
 * collapsed the header and left a year on screen, with no menu, nothing to
 * choose from, and no way to tell that the pager had changed page at all. A
 * control whose affordance says *choose* has to answer with a choice.
 *
 * **A year of months at once, not a scrolling list.** Twelve is the whole set
 * and it fits in four columns; a list would make the reader scroll to find out
 * there was nothing more to find. The year steps above the grid, so any month
 * is at most a step and a tap away.
 *
 * **Every month is offered, including empty ones.** A grid that hid the months
 * with no transactions would be a grid that changes shape as the ledger fills,
 * and "why is March missing" is a worse question than an empty March. The
 * forward horizon is the one exception (S04 §6): a month that has not happened
 * is disabled rather than absent, so the edge is visible where it is.
 */

import type { YearMonth } from "@waltning/core/date";
import { memo, useCallback } from "react";
import { Pressable, Text, View } from "react-native";
import { monthShort } from "../../../i18n/locales.ts";
import { useLocale, useT } from "../../../i18n/provider";
import { useInteraction } from "../../../primitives/interaction.ts";
import { text } from "../../../theme/fonts.ts";
import { useTheme } from "../../../theme/provider";
import { makeStyles } from "../../../theme/styles.ts";
import { focus, radius, space, touchTarget } from "../../../tokens.ts";
import { CaretLeftIcon, CaretRightIcon } from "../../phosphor";
import { BottomSheet } from "../bottom-sheet/bottom-sheet";

const ICON = 18;
const MONTHS = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12] as const;

export type PeriodPickerProps = {
  visible: boolean;
  /** The year the grid is showing. Stepped by the arrows, not by the caller's date. */
  year: number;
  /** The month currently open in the pager, marked in the grid. */
  current: YearMonth;
  /** The last month that exists — everything after it is disabled (S04 §6). */
  horizon: YearMonth;
  onYearChange: (year: number) => void;
  onPick: (month: YearMonth) => void;
  onDismiss: () => void;
};

/** `2026-09`, built rather than formatted — the value is a key, not a label. */
function key(year: number, month: number): YearMonth {
  return `${year}-${String(month).padStart(2, "0")}` as YearMonth;
}

function MonthCell({
  month,
  selected,
  disabled,
  label,
  onPick,
}: {
  month: YearMonth;
  selected: boolean;
  disabled: boolean;
  label: string;
  onPick: (month: YearMonth) => void;
}) {
  const styles = useStyles();
  const { focused, handlers } = useInteraction();
  const press = useCallback(() => onPick(month), [onPick, month]);
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      // `selected` flat as well as in the state object: `react-native-web` maps
      // neither `accessibilityState.selected` nor the native pair, so without
      // it the web build announces twelve identical buttons.
      accessibilityState={{ selected, disabled }}
      {...(selected ? SELECTED : UNSELECTED)}
      disabled={disabled}
      onPress={press}
      {...handlers}
      style={[
        styles.cell,
        selected ? styles.cellSelected : null,
        focused ? styles.focused : null,
        disabled ? styles.dim : null,
      ]}
    >
      <Text style={[styles.cellLabel, selected ? styles.cellLabelSelected : null]}>{label}</Text>
    </Pressable>
  );
}

function PeriodPickerView({
  visible,
  year,
  current,
  horizon,
  onYearChange,
  onPick,
  onDismiss,
}: PeriodPickerProps) {
  const t = useT();
  const locale = useLocale();
  const styles = useStyles();
  const ink = useTheme().text;

  const previous = useCallback(() => onYearChange(year - 1), [onYearChange, year]);
  const next = useCallback(() => onYearChange(year + 1), [onYearChange, year]);

  return (
    <BottomSheet visible={visible} title={t("shell.pickPeriod")} onDismiss={onDismiss}>
      <View style={styles.yearRow}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={t("shell.previousYear")}
          onPress={previous}
          style={styles.yearStep}
        >
          <CaretLeftIcon size={ICON} color={ink} />
        </Pressable>
        {/*
          A heading, not a label: it names what the grid below it holds, and a
          reader arriving in the sheet should hear which year they are choosing
          within before they hear twelve months.
        */}
        <Text accessibilityRole="header" style={styles.year}>
          {year}
        </Text>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={t("shell.nextYear")}
          onPress={next}
          style={styles.yearStep}
        >
          <CaretRightIcon size={ICON} color={ink} />
        </Pressable>
      </View>

      <View style={styles.grid}>
        {MONTHS.map((month) => {
          const value = key(year, month);
          return (
            <MonthCell
              key={value}
              month={value}
              selected={value === current}
              disabled={value > horizon}
              label={monthShort(value, locale)}
              onPick={onPick}
            />
          );
        })}
      </View>
    </BottomSheet>
  );
}

/**
 * `react-native-web` drops `accessibilityState.selected`, so the chosen month
 * is announced like every other one without this (`conformance.test.ts`).
 */
const SELECTED: { "aria-selected": true } = { "aria-selected": true };
const UNSELECTED: { "aria-selected": false } = { "aria-selected": false };

export const PeriodPicker = memo(PeriodPickerView);

const useStyles = makeStyles((theme) => ({
  yearRow: { flexDirection: "row", alignItems: "center", justifyContent: "center" },
  yearStep: {
    minWidth: touchTarget.min,
    minHeight: touchTarget.min,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: radius.sm,
  },
  year: { ...text.display("displayThree"), color: theme.text, minWidth: 76, textAlign: "center" },
  grid: { flexDirection: "row", flexWrap: "wrap", gap: space.md },
  cell: {
    // Four across: twelve months in three rows, and a cell wide enough for an
    // abbreviation in any locale rather than for three Latin characters.
    flexBasis: "22%",
    flexGrow: 1,
    minHeight: touchTarget.min,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: radius.sm,
    backgroundColor: theme.subtleFill,
  },
  cellSelected: { backgroundColor: theme.accent },
  cellLabel: { ...text.ui("bodySm", 600), color: theme.text },
  // `textOnAccent`, never `accentText`: one is the ink that sits on the fill,
  // the other is the accent used as ink. On the selected cell the second is
  // green on green — 1.28:1, where 4.5 is required.
  cellLabelSelected: { color: theme.textOnAccent },
  focused: {
    outlineWidth: focus.width,
    outlineColor: theme.focusRing,
    outlineOffset: focus.offset,
  },
  dim: { opacity: 0.35 },
}));
