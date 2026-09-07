/**
 * `<MergeRow>` — S13's record of one merge into this counterparty, with the
 * way back out of it.
 *
 * A merge is reversible, and the row that announces it is where the reversal
 * belongs: the alternative is a screen-level list of undo buttons that has to
 * restate which merge each one belongs to.
 */

import { useCallback } from "react";
import { Text, View } from "react-native";
import { useT } from "../../../i18n/provider";
import { Button } from "../../../primitives/atoms/button/button";
import { text } from "../../../theme/fonts.ts";
import { makeStyles } from "../../../theme/styles.ts";
import { space } from "../../../tokens.ts";

export type MergeRowProps = {
  mergeId: string;
  loserName: string;
  movedCount: number;
  onUnmerge: (mergeId: string) => void;
};

export function MergeRow({ mergeId, loserName, movedCount, onUnmerge }: MergeRowProps) {
  const t = useT();
  const styles = useStyles();
  const handleUnmerge = useCallback(() => onUnmerge(mergeId), [mergeId, onUnmerge]);
  return (
    <View style={styles.row}>
      <Text style={styles.text}>
        {t("counterparties.mergedInto", { name: loserName, count: movedCount })}
      </Text>
      <Button label={t("counterparties.unmerge")} onPress={handleUnmerge} variant="ghost" />
    </View>
  );
}

const useStyles = makeStyles((theme) => ({
  row: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: space.md,
  },
  text: { flexShrink: 1, color: theme.textMuted, ...text.ui("caption") },
}));
