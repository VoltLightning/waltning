/**
 * `<DayHeader>` — the date a run of entries belongs to, S10 §3's day grouping.
 *
 * A kicker rather than a heading: it separates a run of rows, it does not
 * title a section anyone navigates to. The ledger, the calendar's day scale
 * and any future grouped list all want the same mark, and a list that draws
 * its own is a list whose separator drifts from everyone else's.
 */

import { Text, View } from "react-native";
import { text } from "../../../theme/fonts.ts";
import { makeStyles } from "../../../theme/styles.ts";
import { space } from "../../../tokens.ts";

export type DayHeaderProps = {
  label: string;
  /**
   * The day's own figure, already rendered — S04 §3.
   *
   * **A node rather than a value**, because what belongs here depends on what
   * the day is: an `<Amount>` on an ordinary day, an approximate one where a
   * currency was converted, and a plain dash where a leg could not be priced
   * at all (S04 §5). A `value` prop would make this component decide which,
   * and it cannot see the rows.
   *
   * Absent on S10, which groups by day and states its total once at the top
   * rather than per day.
   */
  total?: React.ReactNode;
};

export function DayHeader({ label, total }: DayHeaderProps) {
  const styles = useStyles();
  return (
    <View style={styles.header}>
      <Text style={styles.text}>{label}</Text>
      {total === undefined ? null : <View style={styles.total}>{total}</View>}
    </View>
  );
}

const useStyles = makeStyles((theme) => ({
  header: {
    paddingTop: space.x3,
    paddingBottom: space.xs,
    flexDirection: "row",
    alignItems: "baseline",
    // Baseline rather than centre: a kicker and a figure at different sizes
    // sit on a shared line only if they share the line they sit on.
    justifyContent: "space-between",
    gap: space.sm,
  },
  total: { flexShrink: 0 },
  text: { color: theme.textMuted, ...text.ui("kicker") },
}));
