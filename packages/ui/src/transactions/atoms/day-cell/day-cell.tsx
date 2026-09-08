/**
 * `<DayCell>` — one day in `DayRibbon`, S04 §3.
 *
 * Weekday letter, day number, and one mark for how much moved. 44×56 so the
 * whole cell is the target rather than the number inside it.
 *
 * **The mark means activity, never direction.** Size and darkness carry it,
 * never hue: a salary day, a day of transfers between your own accounts and a
 * day netting to zero all read wrong the moment the mark means *spending*,
 * and a mark whose only signal is colour fails WCAG 1.4.1 besides. Direction
 * lives in the list and in the day's figure, where a sign can be read.
 *
 * **Memoised, and the memo is load-bearing.** The ribbon re-renders whenever
 * the list moves — that is its whole job — and a ribbon of unmemoised cells
 * would redraw sixty of them per frame of a fling. `day-ribbon.test.tsx`
 * pins the count rather than trusting the wrapper: `memo` is a hint, and it
 * stops working silently the moment a parent hands down a fresh object.
 */

import { memo } from "react";
import { Pressable, Text, View } from "react-native";
import { useInteraction } from "../../../primitives/interaction.ts";
import { text } from "../../../theme/fonts.ts";
import { makeStyles } from "../../../theme/styles.ts";
import { focus, radius, space, tabularNums, touchTarget } from "../../../tokens.ts";

/** How much moved that day, in three steps a reader can tell apart at a glance. */
export type DayActivity = "none" | "some" | "heavy";

/**
 * Which way the day netted. `flat` is not "nothing" — it is a day where money
 * moved and none of it left, which is what a day of transfers between your own
 * accounts looks like, and the honest mark for it is neither colour.
 */
export type DayDirection = "out" | "in" | "flat";

export type DayCellProps = {
  /** One letter, already localised — the ribbon resolves it once for the week. */
  weekday: string;
  /** The day of the month, as drawn. */
  day: number;
  activity: DayActivity;
  /** Defaults to `flat`, which is what a day with no rows nets to anyway. */
  direction?: DayDirection;
  /** The day the list is currently showing. At most one cell in a ribbon. */
  current?: boolean;
  /** The real today, which stays marked wherever the list has scrolled to. */
  today?: boolean;
  /** Beyond today: still reachable, drawn quieter. */
  ahead?: boolean;
  /** The full date and what happened, for a reader who cannot see the number. */
  accessibilityLabel: string;
  onPress: () => void;
};

function DayCellView({
  weekday,
  day,
  activity,
  direction = "flat",
  current = false,
  today = false,
  ahead = false,
  accessibilityLabel,
  onPress,
}: DayCellProps) {
  const styles = useStyles();
  const { focused, handlers } = useInteraction();
  const fill = today ? styles.today : current ? styles.current : styles.plain;
  const ink = today ? styles.inkOnFill : styles.ink;
  const sub = today ? styles.subOnFill : styles.sub;

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      accessibilityState={{ selected: current || today }}
      onPress={onPress}
      {...handlers}
      style={[
        styles.cell,
        fill,
        ahead && !today ? styles.ahead : null,
        focused ? styles.focused : null,
      ]}
    >
      <Text style={sub}>{weekday}</Text>
      <Text style={ink}>{day}</Text>
      <View style={[styles.mark, ...markStyle(styles, activity, direction, today)]} />
    </Pressable>
  );
}

/**
 * **Three channels, and none of them is hue alone.** Size is how much moved,
 * colour is which way it went, and a ring against a fill says the direction
 * again without colour. Red and green are the one pair a colourblind reader
 * cannot separate, so the third channel is not decoration — it is what makes
 * the second legal (WCAG 1.4.1).
 *
 * On today's accent fill every mark goes white: a coloured mark on a coloured
 * ground is the one place the pair stops clearing its contrast.
 */
function markStyle(
  styles: ReturnType<typeof useStyles>,
  activity: DayActivity,
  direction: DayDirection,
  today: boolean,
): object[] {
  if (activity === "none") return [styles.markNone];
  const size = activity === "heavy" ? styles.markHeavy : styles.markSome;
  if (today) return [size, styles.markOnFill];
  if (direction === "in") return [size, styles.markIn];
  if (direction === "out") return [size, styles.markOut];
  return [size, styles.markFlat];
}

export const DayCell = memo(DayCellView);

const useStyles = makeStyles((theme) => ({
  cell: {
    // The whole cell is the target, not the number inside it. `touchTarget.min`
    // rather than a literal, so the floor moves in one place if it ever moves.
    width: 48,
    minWidth: touchTarget.min,
    minHeight: 44,
    height: 66,
    borderRadius: radius.md,
    alignItems: "center",
    justifyContent: "center",
    gap: space.sm,
  },
  plain: { backgroundColor: "transparent" },
  current: { backgroundColor: theme.accentFill },
  today: { backgroundColor: theme.accent },
  ahead: { opacity: 0.48 },
  // §2.6: never removed, never a colour change alone — a colour-only focus
  // state is invisible to exactly the people it exists for.
  focused: {
    outlineWidth: focus.width,
    outlineColor: theme.focusRing,
    outlineOffset: focus.offset,
  },
  // `displayThree` is 17/600 — the day number is a figure, and the display
  // face is what says so. Tabular, because a ribbon of numbers that shift
  // width as it scrolls reads as jitter.
  ink: { ...text.display("displayThree"), color: theme.text, fontVariant: [...tabularNums] },
  inkOnFill: {
    ...text.display("displayThree"),
    color: theme.textOnAccent,
    fontVariant: [...tabularNums],
  },
  sub: { ...text.ui("caption", 600), color: theme.textMuted },
  subOnFill: { ...text.ui("caption", 600), color: theme.textOnAccent },
  mark: { borderRadius: radius.pill },
  markNone: { width: 5, height: 5, backgroundColor: theme.insetFill },
  markSome: { width: 8, height: 8 },
  markHeavy: { width: 12, height: 12 },
  // Filled for out, a ring for in — the money colours, unchanged. A saturated
  // pair was drawn and rejected: the figures and the marks disagreeing about
  // what green means is worse than a mark that is quiet at 8px.
  markOut: { backgroundColor: theme.spend },
  markIn: { borderWidth: 2, borderColor: theme.income },
  markFlat: { backgroundColor: theme.textMuted },
  markOnFill: { backgroundColor: theme.textOnAccent },
}));
