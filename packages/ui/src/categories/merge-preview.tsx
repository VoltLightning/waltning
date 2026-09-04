/**
 * `<MergePreview>` — `screens/S19-settings-categories.md` §4, §7. *"States
 * how many transactions will move, and from where — before it happens."*
 *
 * A short "loser → winner" line over `ComparisonTable` (`shell/`), which
 * carries the three tables `merge_categories` actually repoints —
 * transactions, lines, recurring rules — so the number a person confirms
 * against is the number the write will move, not an estimate.
 */

import { Text, View } from "react-native";
import { useT } from "../i18n/provider";
import { ComparisonTable } from "../shell/comparison-table";
import { text } from "../theme/fonts.ts";
import { makeStyles } from "../theme/styles.ts";
import { space } from "../tokens.ts";

export type MergePreviewCounts = {
  transactions: number;
  lines: number;
  rules: number;
};

export type MergePreviewProps = {
  loserName: string;
  winnerName: string;
  counts: MergePreviewCounts;
};

export function MergePreview({ loserName, winnerName, counts }: MergePreviewProps) {
  const t = useT();
  const styles = useStyles();

  return (
    <View style={styles.root}>
      <Text style={styles.direction}>
        {loserName} → {winnerName}
      </Text>
      <ComparisonTable
        rows={[
          { label: t("categories.mergeRowTransactions"), value: String(counts.transactions) },
          { label: t("categories.mergeRowLines"), value: String(counts.lines) },
          { label: t("categories.mergeRowRules"), value: String(counts.rules) },
        ]}
      />
    </View>
  );
}

const useStyles = makeStyles((theme) => ({
  root: { gap: space.sm },
  direction: { color: theme.textMuted, ...text.ui("bodySm") },
}));
