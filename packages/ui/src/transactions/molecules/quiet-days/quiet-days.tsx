/**
 * `<QuietDays>` — a day with nothing on it, and a run of them (S04 §6).
 *
 * **A quiet day means something, which is why the list draws it at all.** A
 * filtered list has no such day: a day the filter excluded is not a day, it is
 * an absence of matches. S04's list is the whole ledger, so a day with nothing
 * on it is a day you spent nothing, and skipping it would make a dormant
 * fortnight indistinguishable from a busy one scrolled quickly.
 *
 * **One day is a line; a run is one row.** The rule was one line per empty day
 * until a dormant month made it twenty-five rows of nothing. The threshold is
 * exactly two, because the row naming a two-day span is already shorter than
 * the two lines it replaces.
 *
 * **A run does not open by itself.** *Show* is offered rather than taken,
 * because a run that expanded on approach would move everything under the
 * reader's thumb — and the reason to collapse it was that its contents are
 * worth less than the space they take.
 */

import { memo } from "react";
import { Pressable, Text, View } from "react-native";
import { useInteraction } from "../../../primitives/interaction.ts";
import { text } from "../../../theme/fonts.ts";
import { makeStyles } from "../../../theme/styles.ts";
import { focus, radius, space, touchTarget } from "../../../tokens.ts";

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
      <Text style={styles.dayText}>{label}</Text>
      <View style={styles.rule} />
      <Text style={styles.dayText}>{emptyLabel}</Text>
    </View>
  );
}

export const QuietDay = memo(QuietDayView);

export type QuietRunProps = {
  /** The span, localised — `3 – 27 August`. */
  label: string;
  /** How long it was, localised and pluralised — `25 days · nothing recorded`. */
  summary: string;
  /** The action's own word — *Show*. */
  showLabel: string;
  onShow: () => void;
};

function QuietRunView({ label, summary, showLabel, onShow }: QuietRunProps) {
  const styles = useStyles();
  const { focused, handlers } = useInteraction();
  return (
    <View style={styles.run}>
      <View style={styles.runText}>
        <Text style={styles.runLabel}>{label}</Text>
        <Text style={styles.runSummary}>{summary}</Text>
      </View>
      <Pressable
        accessibilityRole="button"
        // The span, not the bare word: a reader hearing four *Show* buttons
        // in a scroll cannot tell which stretch of days each one opens.
        accessibilityLabel={`${showLabel}: ${label}`}
        onPress={onShow}
        {...handlers}
        style={[styles.show, focused ? styles.focused : null]}
      >
        <Text style={styles.showText}>{showLabel}</Text>
      </Pressable>
    </View>
  );
}

export const QuietRun = memo(QuietRunView);

const useStyles = makeStyles((theme) => ({
  day: {
    flexDirection: "row",
    alignItems: "center",
    gap: space.sm,
    paddingVertical: space.sm,
    paddingHorizontal: space.xs,
  },
  // The rule fills the gap so the two words read as one statement rather than
  // as a label and an unrelated value at opposite edges.
  rule: { flex: 1, height: 1, backgroundColor: theme.border },
  // `textMuted`, not `textFaint`: faint is decoration — a chevron, a unit, a
  // repeating rule — and this is the only text the line has. A quiet day is
  // quiet, not unreadable.
  dayText: { ...text.ui("caption"), color: theme.textMuted },
  run: {
    flexDirection: "row",
    alignItems: "center",
    gap: space.sm,
    backgroundColor: theme.surface,
    borderWidth: 1,
    borderColor: theme.border,
    borderRadius: radius.lg,
    paddingVertical: space.sm,
    paddingHorizontal: space.x3,
  },
  runText: { flex: 1 },
  runLabel: { ...text.ui("bodySm", 600), color: theme.text },
  runSummary: { ...text.ui("caption"), color: theme.textMuted },
  show: {
    minHeight: touchTarget.min,
    minWidth: touchTarget.min,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: space.md,
    borderRadius: radius.md,
    backgroundColor: theme.insetFill,
    borderWidth: 1,
    // A control's edge, not a divider: `border` is the divider value and
    // cannot carry WCAG 1.4.11's 3:1 around something you press.
    borderColor: theme.borderInteractive,
  },
  focused: {
    outlineWidth: focus.width,
    outlineColor: theme.focusRing,
    outlineOffset: focus.offset,
  },
  showText: { ...text.ui("bodySm", 600), color: theme.text },
}));
