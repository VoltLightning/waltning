/**
 * `<ComparisonTable>` — `design-system/05` §5.6. A short list of labelled
 * figures, read top to bottom rather than across.
 *
 * **Deliberately plain.** Every screen that names this component reads it
 * differently — S19's merge preview counts rows that move, S25 compares a
 * period against the one before, S29 compares an expected balance against an
 * imported one — so the shape here is the one thing they share: a label, a
 * value, an optional note for an inline exclusion or caveat (§6.8: *"never
 * silently"*), and a tone for the one case §5.6 calls out by name — an
 * increase in spend takes `negative` ink, never colour alone (P5), which is
 * why the tone still renders beside the value as a `Tag`-less colour change
 * on text that already says what it means.
 */

import { Text, View } from "react-native";
import { text } from "../theme/fonts.ts";
import { makeStyles } from "../theme/styles.ts";
import { hairline, space } from "../tokens.ts";

export type ComparisonTone = "negative" | "positive" | "neutral";

export type ComparisonRow = {
  label: string;
  value: string;
  /** A quieter second line — an exclusion or a caveat, stated rather than hidden. */
  note?: string;
  /** `neutral` (the default) draws the value in the ordinary ink. */
  tone?: ComparisonTone;
};

export type ComparisonTableProps = {
  rows: readonly ComparisonRow[];
};

/** Each tone's ink as its own stylesheet entry — never an object built in JSX. */
const INK_STYLE = {
  negative: "ink_negative",
  positive: "ink_positive",
  neutral: "ink_neutral",
} as const satisfies Record<ComparisonTone, string>;

export function ComparisonTable({ rows }: ComparisonTableProps) {
  const styles = useStyles();

  return (
    <View style={styles.root}>
      {rows.map((row, index) => (
        <View
          // Rows are a fixed, caller-ordered list with no identity of their
          // own beyond position — the same reasoning `TransactionList` uses
          // for a key that is not a domain id.
          // biome-ignore lint/suspicious/noArrayIndexKey: position is the identity here
          key={index}
          style={[styles.row, index === rows.length - 1 ? null : styles.divider]}
        >
          <View style={styles.label}>
            <Text style={styles.labelText}>{row.label}</Text>
            {row.note === undefined ? null : <Text style={styles.note}>{row.note}</Text>}
          </View>
          <Text style={[styles.value, styles[INK_STYLE[row.tone ?? "neutral"]]]}>{row.value}</Text>
        </View>
      ))}
    </View>
  );
}

const useStyles = makeStyles((theme) => ({
  root: { gap: 0 },
  ink_negative: { color: theme.dangerText },
  ink_positive: { color: theme.income },
  ink_neutral: { color: theme.text },
  row: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: space.x3,
    paddingVertical: space.md,
  },
  divider: { borderBottomWidth: hairline.width, borderBottomColor: theme.hairline },
  label: { flexShrink: 1, gap: space.xxs },
  labelText: { color: theme.text, ...text.ui("body") },
  note: { color: theme.textMuted, ...text.ui("caption") },
  value: { ...text.ui("body", 600) },
}));
