/**
 * `<Calendar>` — `design-system/03` §3.7a's desk affordance.
 *
 * **A wheel is a thumb control.** It trades precision for momentum, which is
 * the right trade held in one hand and the wrong one in front of a keyboard.
 * So the desk gets the month grid the web has taught everyone to expect, and
 * the typed `YYYY-MM-DD` in the field above stays the fastest way in for a
 * date somebody already knows. Both write the same bare `AccountingDate`.
 *
 * **Anchored to the field, in a `Modal`.** The same two reasons `Select` gives:
 * a panel laid out in the flow pushes the page down as it opens, and a `Modal`
 * is the only way out of the layout tree that behaves the same on all three
 * targets. The geometry is `anchor.ts`, already tested as arithmetic.
 *
 * **Picking is answering**, so a day closes the panel — the `Select` promise,
 * not `MultiSelect`'s. There is no confirm here and that asymmetry with
 * `DatePicker` is deliberate: a drum passes over ten values on the way to one
 * and needs a moment to mean it, where a click on the 14th means the 14th.
 */

import { type AccountingDate, shiftMonth, yearMonth } from "@waltning/core/date";
import { useCallback, useState } from "react";
import { Modal, Pressable, Text, useWindowDimensions, View } from "react-native";
import { dayLabel, monthLabel, weekdayInitial, weekStart } from "../../../i18n/locales";
import { useLocale, useT } from "../../../i18n/provider";
import { text } from "../../../theme/fonts.ts";
import { makeStyles } from "../../../theme/styles.ts";
import { focus, radius, space, touchTarget } from "../../../tokens.ts";
import { type Anchor, panelPlacement } from "../../anchor.ts";
import { PressableScaled } from "../../atoms/pressable-scaled/pressable-scaled";
import { useInteraction } from "../../interaction.ts";
import { useWindowInsets } from "../../safe-area";
import { partsOf } from "../date-picker/parts.ts";
import { headingDates, weeksOf } from "./weeks.ts";

export type CalendarProps = {
  /** The panel's accessible name — the field's own label. */
  label: string;
  value: AccountingDate;
  onChange: (value: AccountingDate) => void;
  /** The device's local `AccountingDate` (§7.0a) — marked wherever the reader pages to. */
  today: AccountingDate;
  anchor: Anchor | null;
  onDismiss: () => void;
};

export function Calendar({ label, value, onChange, today, anchor, onDismiss }: CalendarProps) {
  const styles = useStyles();
  const locale = useLocale();
  const t = useT();
  const insets = useWindowInsets();
  const frame = useWindowDimensions();
  const [showing, setShowing] = useState(() => {
    const { year, month } = partsOf(value);
    return yearMonth(`${String(year).padStart(4, "0")}-${String(month + 1).padStart(2, "0")}`);
  });

  const handlePrevious = useCallback(() => setShowing((at) => shiftMonth(at, -1)), []);
  const handleNext = useCallback(() => setShowing((at) => shiftMonth(at, 1)), []);

  const { year, month } = partsOf(`${showing}-01`);
  const start = weekStart(locale);
  const weeks = weeksOf(year, month, start);
  const placement = anchor === null ? null : panelPlacement(anchor, frame, insets, PANEL_CAP);

  return (
    <Modal
      accessibilityLabel={label}
      transparent
      visible
      onRequestClose={onDismiss}
      animationType="none"
      statusBarTranslucent
      navigationBarTranslucent
    >
      <View style={styles.overlay}>
        {/* A backdrop, so a bare `Pressable` — `Select`'s own exception. */}
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={t("common.dismissOptions")}
          onPress={onDismiss}
          style={styles.backdrop}
        />
        <View style={[styles.panel, placement]}>
          <View style={styles.header}>
            <MonthStep
              label={t("common.previousMonth")}
              direction="previous"
              onPress={handlePrevious}
            />
            <Text style={styles.month}>{monthLabel(showing, locale)}</Text>
            <MonthStep label={t("common.nextMonth")} direction="next" onPress={handleNext} />
          </View>

          <View style={styles.row}>
            {headingDates(start).map((day) => (
              // The date is the key: two columns can share an initial, so the
              // letter cannot identify the column.
              <Text key={day} style={styles.heading}>
                {weekdayInitial(day, locale)}
              </Text>
            ))}
          </View>

          {weeks.map((week) => (
            <View key={week[0]?.date} style={styles.row}>
              {week.map((cell) => (
                <Day
                  key={cell.date}
                  date={cell.date}
                  inMonth={cell.inMonth}
                  selected={cell.date === value}
                  isToday={cell.date === today}
                  onPick={onChange}
                />
              ))}
            </View>
          ))}
        </View>
      </View>
    </Modal>
  );
}

/** Six rows, a header and the headings — what `panelPlacement` must fit. */
const PANEL_CAP = touchTarget.min * 8;

type MonthStepProps = {
  label: string;
  direction: "previous" | "next";
  onPress: () => void;
};

/**
 * **The arrow is drawn, not typed** (§3.7). The shell owns the icon set and a
 * primitive that reached for it would invert the foundation — but the spec
 * already answers this: a chevron is two borders rotated 45°, the same mark in
 * every face and theme, where a glyph is whatever the fallback font says.
 */
function MonthStep({ label, direction, onPress }: MonthStepProps) {
  const styles = useStyles();
  const { focused, handlers } = useInteraction();
  return (
    <PressableScaled
      accessibilityRole="button"
      accessibilityLabel={label}
      onPress={onPress}
      {...handlers}
      style={[styles.step, focused ? styles.stepFocused : null]}
    >
      <View style={[styles.stepMark, direction === "previous" ? styles.stepBack : null]} />
    </PressableScaled>
  );
}

type DayProps = {
  date: AccountingDate;
  inMonth: boolean;
  selected: boolean;
  isToday: boolean;
  onPick: (date: AccountingDate) => void;
};

/**
 * Its own component so the press handler is a named reference rather than an
 * arrow built in JSX, and so one cell's state cannot re-render the grid.
 */
function Day({ date, inMonth, selected, isToday, onPick }: DayProps) {
  const styles = useStyles();
  const locale = useLocale();
  const { focused, handlers } = useInteraction();
  const handlePress = useCallback(() => onPick(date), [date, onPick]);

  return (
    <PressableScaled
      accessibilityRole="button"
      accessibilityLabel={dayLabel(date, locale)}
      accessibilityState={{ selected }}
      aria-selected={selected}
      onPress={handlePress}
      {...handlers}
      style={[styles.day, selected ? styles.daySelected : null, focused ? styles.dayFocused : null]}
    >
      <Text
        style={[
          styles.dayText,
          inMonth ? null : styles.dayOutside,
          selected ? styles.daySelectedText : null,
        ]}
      >
        {String(partsOf(date).day)}
      </Text>
      {/* Today keeps its mark wherever the reader has paged to. */}
      {isToday && !selected ? <View style={styles.todayMark} /> : null}
    </PressableScaled>
  );
}

const useStyles = makeStyles((theme) => ({
  overlay: { flex: 1 },
  backdrop: { ...({ position: "absolute" } as const), top: 0, right: 0, bottom: 0, left: 0 },
  panel: {
    ...({ position: "absolute" } as const),
    backgroundColor: theme.surface,
    borderWidth: 1,
    borderColor: theme.border,
    borderRadius: radius.md,
    padding: space.md,
    gap: space.xs,
  },
  header: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  step: {
    width: touchTarget.min,
    height: touchTarget.min,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: radius.sm,
    borderWidth: 1,
    borderColor: "transparent",
  },
  stepFocused: {
    borderWidth: focus.width,
    borderColor: theme.focusRing,
    outlineWidth: 0,
    outlineStyle: "solid",
  },
  /** Two borders rotated 45°, pointing right; `stepBack` turns it around. */
  stepMark: {
    width: 9,
    height: 9,
    borderRightWidth: 1.5,
    borderTopWidth: 1.5,
    borderColor: theme.textMuted,
    transform: [{ rotate: "45deg" }],
    marginRight: 3,
  },
  stepBack: { transform: [{ rotate: "225deg" }], marginRight: 0, marginLeft: 3 },
  month: { color: theme.text, ...text.ui("body", 600) },
  row: { flexDirection: "row" },
  heading: {
    width: touchTarget.min,
    textAlign: "center",
    color: theme.textMuted,
    ...text.ui("kicker"),
  },
  day: {
    width: touchTarget.min,
    height: touchTarget.min,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: radius.sm,
    borderWidth: 1,
    borderColor: "transparent",
  },
  dayFocused: {
    borderWidth: focus.width,
    borderColor: theme.focusRing,
    outlineWidth: 0,
    outlineStyle: "solid",
  },
  daySelected: { backgroundColor: theme.accentFill, borderColor: theme.accentFillBorder },
  dayText: { color: theme.text, ...text.ui("bodySm") },
  daySelectedText: { color: theme.accentText, ...text.ui("bodySm", 600) },
  /**
   * **Muted, not faint.** A lead or tail day is dimmer than its month but it
   * is still a day someone reads and clicks — `faint` is 2.05:1 and belongs to
   * marks, not to text that is acted on.
   */
  dayOutside: { color: theme.textMuted },
  todayMark: {
    width: 4,
    height: 4,
    borderRadius: radius.pill,
    backgroundColor: theme.accentIcon,
    marginTop: 2,
  },
}));
