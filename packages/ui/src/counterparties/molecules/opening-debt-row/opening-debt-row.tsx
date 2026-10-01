/**
 * `<OpeningDebtRow>` — S13's line for a debt that predates the ledger (§6.6).
 *
 * The history under the card lists transactions, and an existing debt is not
 * one, so without this line a number in the ledger above would have nothing
 * under it that explains it (S13 §3: *every visible row explains a number*).
 * It names the figure through `<Amount>`, which way it points in words, and
 * the day it dates from; tapping it opens the same sheet to correct it.
 */

import type { AccountingDate } from "@waltning/core/date";
import type { Money } from "@waltning/core/money";
import { useCallback } from "react";
import { Text, View } from "react-native";
import { Amount } from "../../../fx/atoms/amount/amount";
import { dayLabel } from "../../../i18n/locales";
import { useLocale, useT } from "../../../i18n/provider";
import { PressableScaled } from "../../../primitives/atoms/pressable-scaled/pressable-scaled";
import { useInteraction } from "../../../primitives/interaction.ts";
import { text } from "../../../theme/fonts.ts";
import { makeStyles } from "../../../theme/styles.ts";
import { focus, space, touchTarget } from "../../../tokens.ts";

export type OpeningDebtRowProps = {
  id: string;
  direction: "theyOwe" | "youOwe";
  amount: Money;
  currency: string;
  decimals: number;
  date: AccountingDate;
  onPress: (id: string) => void;
};

export function OpeningDebtRow({
  id,
  direction,
  amount,
  currency,
  decimals,
  date,
  onPress,
}: OpeningDebtRowProps) {
  const t = useT();
  const styles = useStyles();
  const locale = useLocale();
  const { focused, handlers } = useInteraction();
  const handlePress = useCallback(() => onPress(id), [id, onPress]);
  const directionLabel =
    direction === "theyOwe"
      ? t("counterparties.existingDebtTheyOwe")
      : t("counterparties.existingDebtYouOwe");
  const meta = t("counterparties.existingDebtRowMeta", {
    direction: directionLabel,
    date: dayLabel(date, locale),
  });

  return (
    <PressableScaled
      accessibilityRole="button"
      accessibilityLabel={`${t("counterparties.existingDebtRow")}, ${meta}`}
      onPress={handlePress}
      {...handlers}
      style={[styles.row, focused ? styles.focused : null]}
    >
      <View style={styles.words}>
        <Text style={styles.title}>{t("counterparties.existingDebtRow")}</Text>
        <Text style={styles.meta}>{meta}</Text>
      </View>
      <Amount value={amount} currency={currency} decimals={decimals} size="small" />
    </PressableScaled>
  );
}

const useStyles = makeStyles((theme) => ({
  focused: {
    outlineWidth: focus.width,
    outlineColor: theme.focusRing,
    outlineOffset: focus.offset,
  },
  row: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: space.md,
    minHeight: touchTarget.min,
  },
  words: { flexShrink: 1, gap: space.xxs },
  title: { color: theme.text, ...text.ui("body") },
  meta: { color: theme.textMuted, ...text.ui("caption") },
}));
