/**
 * The tab glyphs `use-tab-bar-items.tsx` hands to `<TabBar>` — four of them
 * wired today, and `CalendarTabIcon` waiting for S11 to build the screen it
 * belongs to. Drawn the
 * same way `FloatingAdd`'s plus and `Select`'s chevron are, because no icon
 * library is installed yet. **§2.8 names Phosphor duotone via
 * `react-native-svg` for the real set — that install is its own card, not
 * this one.** Each glyph is a fixed 20×20 shape built from plain `View`s, so
 * it costs nothing to swap later — `TabBar` only ever sees a `ReactNode`.
 *
 * **One box for all five, and the mark is drawn inside it.** `Today` used to
 * *be* its 14px square rather than sit in a 20px box, so its label rose 3px
 * above the other four and the bar read as slightly broken without anyone
 * being able to say why. The box is `TAB_ICON_SIZE`, which `TabBar` reserves
 * for whatever node it is handed — a glyph is free to be smaller than the
 * box; it is never free to change the row's height.
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

/**
 * The box every glyph is drawn in, and the box `TabBar` reserves for it.
 * Exported so the two cannot drift: a bar reserving 24 for a 20px set is a
 * 4px gap under every label, and nothing would say so.
 */
export const TAB_ICON_SIZE = 20;

const SIZE = TAB_ICON_SIZE;

export type TabIconProps = { active?: boolean };

export function TodayTabIcon({ active = false }: TabIconProps) {
  const styles = useStyles();
  return (
    <View style={styles.box}>
      <View style={[styles.square, active ? styles.fillActive : styles.fillInactive]} />
    </View>
  );
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

/**
 * `Settings` — two slider tracks, offset knobs. The classic controls mark,
 * drawn the same way as every other glyph here: bars and soft squares, the
 * knob a `radius.xs` square rather than the round thumb a real slider draws.
 */
export function SettingsTabIcon({ active = false }: TabIconProps) {
  const styles = useStyles();
  const fill = active ? styles.fillActive : styles.fillInactive;
  return (
    <View style={styles.sliders}>
      <View style={styles.sliderTrack}>
        <View style={[styles.sliderTrackLine, fill]} />
        <View style={[styles.sliderKnob, fill, styles.sliderKnobNear]} />
      </View>
      <View style={styles.sliderTrack}>
        <View style={[styles.sliderTrackLine, fill]} />
        <View style={[styles.sliderKnob, fill, styles.sliderKnobFar]} />
      </View>
    </View>
  );
}

const useStyles = makeStyles((theme) => ({
  fillActive: { backgroundColor: theme.accentText },
  fillInactive: { backgroundColor: theme.textMuted },
  tintActive: { borderColor: theme.accentText },
  tintInactive: { borderColor: theme.textMuted },

  /** The 20px box the other four glyphs already are. */
  box: { width: SIZE, height: SIZE, alignItems: "center", justifyContent: "center" },
  /** `Today` — a plain filled soft rectangle, the simplest mark of the five. */
  square: { width: 14, height: 14, borderRadius: radius.xs },

  /** `Ledger` — three stacked rows, the list a ledger already is. */
  stack: {
    width: SIZE,
    height: SIZE,
    justifyContent: "space-between",
    paddingVertical: space.xxs,
  },
  bar: { height: 3, borderRadius: radius.xs },

  /** `Calendar` — a bordered page with a header band and a day grid. */
  frame: {
    width: SIZE,
    height: SIZE,
    borderWidth: 1.5,
    borderRadius: radius.xs,
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
  calendarDot: { width: 4, height: 4 },

  /** `Debt` — an arrow: money that moved, and which way. */
  arrowBox: { width: SIZE, height: SIZE, alignItems: "center", justifyContent: "center" },
  arrowShaft: { width: 2, height: 14 },
  arrowHeadLeft: {
    position: "absolute",
    top: 2,
    width: 2,
    height: 8,
    transform: [{ translateX: -3 }, { rotate: "45deg" }],
  },
  arrowHeadRight: {
    position: "absolute",
    top: 2,
    width: 2,
    height: 8,
    transform: [{ translateX: 3 }, { rotate: "-45deg" }],
  },

  /** `Settings` — two slider tracks, a square knob offset on each. */
  sliders: {
    width: SIZE,
    height: SIZE,
    justifyContent: "space-around",
    paddingVertical: space.xxs,
  },
  sliderTrack: { height: 2, justifyContent: "center" },
  sliderTrackLine: { height: 2, borderRadius: radius.xs },
  sliderKnob: { position: "absolute", width: 4, height: 8, borderRadius: radius.xs },
  sliderKnobNear: { left: 5 },
  sliderKnobFar: { left: 13 },
}));
