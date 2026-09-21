/**
 * `<QuietDays>` — a day with nothing on it, and a run of them (S04 §6).
 *
 * **A quiet day means something, which is why the list draws it at all.** A
 * filtered list has no such day: a day the filter excluded is not a day, it is
 * an absence of matches. S04's list is the whole ledger, so a day with nothing
 * on it is a day you spent nothing, and skipping it would make a dormant
 * fortnight indistinguishable from a busy one scrolled quickly.
 *
 * **One day is a line, and so is a run of them.** The rule was one line per
 * empty day until a dormant month made it twenty-five rows of nothing; two or
 * more collapse into one line carrying the range. The threshold is exactly
 * two, because the line naming a two-day span is shorter than the two it
 * replaces.
 */

import { memo } from "react";
import { Text, View } from "react-native";
import { text } from "../../../theme/fonts.ts";
import { makeStyles } from "../../../theme/styles.ts";
import { space } from "../../../tokens.ts";

export type QuietDayProps = {
  /** The date, localised — `Wednesday 13 August`. */
  label: string;
  /** What a day with nothing on it says — localised, e.g. *nothing*. */
  emptyLabel: string;
};

/** One empty day: a line, and nothing to press. */
function QuietDayView({ label, emptyLabel }: QuietDayProps) {
  const styles = useStyles();
  return (
    <View style={styles.day}>
      <Text numberOfLines={1} style={styles.dayText}>
        {label}
      </Text>
      <View style={styles.rule} />
      <Text numberOfLines={1} style={styles.dayText}>
        {emptyLabel}
      </Text>
    </View>
  );
}

export const QuietDay = memo(QuietDayView);

/**
 * Two or more empty days in a row: **the same line a single quiet day is, with
 * the range on it** (S04 §6).
 *
 * It was a card — a bordered surface with the range in bold, the count under
 * it, and a *Show* button — and it was the loudest thing in a list of rows
 * that actually hold something. *Show* went to the run's first day, which
 * shows a list of days with nothing on them: a button whose whole result is
 * what the row already said. Nothing happened, across a span; that is one
 * muted line, and the span is the only thing on it a single day's line does
 * not have.
 *
 * One line, never two: the list above is placed from a table of one height per
 * kind, and a run that wrapped put every run below it out, cumulatively. The
 * range is already the collapsed form (`dayRangeLabel`), and the summary gives
 * way first.
 */
export type QuietRunProps = {
  /** The span, as one range — `7 – 11 August 2026`. */
  label: string;
  /** How long it is and that it is empty — `5 days · nothing recorded`. */
  summary: string;
};

function QuietRunView({ label, summary }: QuietRunProps) {
  const styles = useStyles();
  return (
    <View style={styles.day}>
      <Text numberOfLines={1} style={styles.dayText}>
        {label}
      </Text>
      <View style={styles.rule} />
      <Text numberOfLines={1} style={[styles.dayText, styles.summary]}>
        {summary}
      </Text>
    </View>
  );
}

export const QuietRun = memo(QuietRunView);

const useStyles = makeStyles((theme) => ({
  day: {
    flexDirection: "row",
    alignItems: "center",
    gap: space.sm,
    // **The gap a day's kicker keeps above it** (`list-entry.tsx`'s
    // `dayHeader`). With `sm` all round, the line sat against the card of the
    // day before it — read as that card's caption rather than as the next day.
    paddingTop: space.x2,
    paddingBottom: space.sm,
    paddingHorizontal: space.xs,
  },
  // The rule fills the gap so the two words read as one statement rather than
  // as a label and an unrelated value at opposite edges.
  rule: { flex: 1, height: 1, backgroundColor: theme.border },
  // `textMuted`, not `textFaint`: faint is decoration — a chevron, a unit, a
  // repeating rule — and this is the only text the line has. A quiet day is
  // quiet, not unreadable.
  dayText: { ...text.ui("caption"), color: theme.textMuted },
  // The summary gives way before the range does, and never to nothing.
  summary: { flexShrink: 1 },
}));
