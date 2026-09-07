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

export type DayHeaderProps = { label: string };

export function DayHeader({ label }: DayHeaderProps) {
  const styles = useStyles();
  return (
    <View style={styles.header}>
      <Text style={styles.text}>{label}</Text>
    </View>
  );
}

const useStyles = makeStyles((theme) => ({
  header: { paddingTop: space.x3, paddingBottom: space.xs },
  text: { color: theme.textMuted, ...text.ui("kicker") },
}));
