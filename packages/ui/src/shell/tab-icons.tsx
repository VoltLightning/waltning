/**
 * The four tab glyphs `(tabs)/_layout.tsx` hands to `<TabBar>` — drawn the
 * same way `FloatingAdd`'s plus and `Select`'s chevron are, because no icon
 * library is installed yet. **§2.8 names Phosphor duotone via
 * `react-native-svg` for the real set — that install is its own card, not
 * this one.** Each glyph is a fixed 20×20 shape built from plain `View`s, so
 * it costs nothing to swap later — `TabBar` only ever sees a `ReactNode`.
 *
 * **Soft rectangles, never a circle** — §2.4 reserves the circle for the
 * radio, the switch and the floating add button, and a round tab glyph reads
 * as one of those. Every shape here is `radius.sm` or a straight bar.
 *
 * **The ink follows the label.** `TabBar` colours the active label
 * `accentText`; these take the same `active` flag so the glyph agrees with
 * the word beside it rather than staying `textMuted` regardless of selection.
 */

import { View } from "react-native";
import { makeStyles } from "../theme/styles.ts";
import { radius, space } from "../tokens.ts";

const SIZE = 20;

export type TabIconProps = { active?: boolean };

export function TodayTabIcon({ active = false }: TabIconProps) {
  const styles = useStyles();
  return <View style={[styles.square, active ? styles.fillActive : styles.fillInactive]} />;
}

export function LedgerTabIcon({ active = false }: TabIconProps) {
  const styles = useStyles();
  const bar = active ? styles.fillActive : styles.fillInactive;
  return (
    <View style={styles.stack}>
      <View style={[styles.bar, bar]} />
      <View style={[styles.bar, bar]} />
      <View style={[styles.bar, bar]} />
    </View>
  );
}

export function CalendarTabIcon({ active = false }: TabIconProps) {
  const styles = useStyles();
  const tint = active ? styles.tintActive : styles.tintInactive;
  const fill = active ? styles.fillActive : styles.fillInactive;
  return (
    <View style={[styles.frame, tint]}>
      <View style={[styles.calendarHeader, fill]} />
      <View style={styles.calendarGrid}>
        <View style={[styles.calendarDot, fill]} />
        <View style={[styles.calendarDot, fill]} />
        <View style={[styles.calendarDot, fill]} />
        <View style={[styles.calendarDot, fill]} />
      </View>
    </View>
  );
}

export function DebtTabIcon({ active = false }: TabIconProps) {
  const styles = useStyles();
  const fill = active ? styles.fillActive : styles.fillInactive;
  return (
    <View style={styles.arrowBox}>
      <View style={[styles.arrowShaft, fill]} />
      <View style={[styles.arrowHeadLeft, fill]} />
      <View style={[styles.arrowHeadRight, fill]} />
    </View>
  );
}

const useStyles = makeStyles((theme) => ({
  fillActive: { backgroundColor: theme.accentText },
  fillInactive: { backgroundColor: theme.textMuted },
  tintActive: { borderColor: theme.accentText },
  tintInactive: { borderColor: theme.textMuted },

  /** `Today` — a plain filled soft rectangle, the simplest mark of the four. */
  square: { width: 14, height: 14, borderRadius: radius.sm, alignSelf: "center" },

  /** `Ledger` — three stacked rows, the list a ledger already is. */
  stack: {
    width: SIZE,
    height: SIZE,
    justifyContent: "space-between",
    paddingVertical: space.xxs,
  },
  bar: { height: 3, borderRadius: radius.sm },

  /** `Calendar` — a bordered page with a header band and a day grid. */
  frame: {
    width: SIZE,
    height: SIZE,
    borderWidth: 1.5,
    borderRadius: radius.sm,
    overflow: "hidden",
  },
  calendarHeader: { height: 5 },
  calendarGrid: {
    flex: 1,
    flexDirection: "row",
    flexWrap: "wrap",
    alignContent: "space-around",
    justifyContent: "space-around",
    padding: space.xxs,
  },
  calendarDot: { width: 4, height: 4, borderRadius: radius.sm },

  /** `Debt` — an arrow: money that moved, and which way. */
  arrowBox: { width: SIZE, height: SIZE, alignItems: "center", justifyContent: "center" },
  arrowShaft: { width: 2, height: 14, borderRadius: radius.sm },
  arrowHeadLeft: {
    position: "absolute",
    top: 2,
    width: 2,
    height: 8,
    borderRadius: radius.sm,
    transform: [{ translateX: -3 }, { rotate: "45deg" }],
  },
  arrowHeadRight: {
    position: "absolute",
    top: 2,
    width: 2,
    height: 8,
    borderRadius: radius.sm,
    transform: [{ translateX: 3 }, { rotate: "-45deg" }],
  },
}));
