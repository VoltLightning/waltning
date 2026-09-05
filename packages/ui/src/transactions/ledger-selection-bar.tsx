/**
 * `<LedgerSelectionBar>` — S10 §7 (web): "multi-select enables
 * `categorize_batch`." The strip that appears once a shift-click range
 * exists, above `<LedgerTable>`.
 *
 * **Presentational only — it does not open the category picker itself.**
 * `packages/ui/src/transactions/` may not import `packages/ui/src/
 * categories/` (`tests/module-boundaries.test.ts`: no feature imports
 * another), so the screen owns the sequence — this bar only ever reports
 * "categorise was asked for" and "clear was asked for."
 */

import { Text, View } from "react-native";
import { useT } from "../i18n/provider";
import { Button } from "../primitives/button";
import { text } from "../theme/fonts.ts";
import { makeStyles } from "../theme/styles.ts";
import { radius, space } from "../tokens.ts";

export type LedgerSelectionBarProps = {
  /** `0` renders nothing — a bar with nothing selected has nothing to say. */
  count: number;
  onCategorize: () => void;
  onClear: () => void;
};

export function LedgerSelectionBar({ count, onCategorize, onClear }: LedgerSelectionBarProps) {
  const t = useT();
  const styles = useStyles();

  if (count === 0) return null;

  return (
    <View style={styles.root}>
      <Text style={styles.count}>{t("transactions.selectedCount", { count })}</Text>
      <View style={styles.actions}>
        <Button label={t("common.clear")} variant="ghost" size="sm" onPress={onClear} />
        <Button
          label={t("transactions.categorise")}
          variant="primary"
          size="sm"
          onPress={onCategorize}
        />
      </View>
    </View>
  );
}

const useStyles = makeStyles((theme) => ({
  root: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: space.x3,
    paddingVertical: space.md,
    paddingHorizontal: space.x3,
    backgroundColor: theme.accentFill,
    borderRadius: radius.sm,
  },
  count: { color: theme.accentText, ...text.ui("bodySm", 600) },
  actions: { flexDirection: "row", gap: space.md },
}));
