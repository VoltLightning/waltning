/**
 * `<OpenDebtsCard>` — the overview's *who owes whom*: one line per person per
 * currency, **"Nina · you owe · 5 €"** and **"Tomasz · owes you · 150 €"**.
 *
 * **Draws what it is handed.** Which lines are open, their order and their
 * direction are `openDebtLines`' answer (`packages/client`); this never reads
 * a sign or decides a balance is dust. The direction is said in words by
 * `DebtDirectionTag` (P5 — never colour alone) and the figure beside it is the
 * magnitude, through `<Amount>`.
 *
 * **Not a fold.** Two currencies with one person are two lines and two
 * people in one currency are two lines: there is no honest single number for
 * either (§6.6), and this card does not invent one.
 *
 * **Absent when nothing is open.** The card returns `null` for no lines — an
 * empty *Nobody owes* card on the screen that states your position would be
 * the ledger explaining a thing that is not there. The register (S12) is where
 * *all settled* is said.
 */

import * as money from "@waltning/core/money";
import { useCallback } from "react";
import { Pressable, Text, View } from "react-native";
import Animated from "react-native-reanimated";
import { Amount } from "../../../fx/atoms/amount/amount";
import { decimalMark } from "../../../i18n/locales.ts";
import { useLocale, useT } from "../../../i18n/provider";
import { useInteraction } from "../../../primitives/interaction.ts";
import { usePressScale } from "../../../primitives/press-scale.ts";
import { Card } from "../../../shell/molecules/card/card";
import { text } from "../../../theme/fonts.ts";
import { makeStyles } from "../../../theme/styles.ts";
import { focus, hairline, space, touchTarget } from "../../../tokens.ts";
import { DebtDirectionTag } from "../../atoms/debt-direction-tag/debt-direction-tag";

export type OpenDebtsCardLine = {
  /** Stable across renders — one line per person per currency. */
  key: string;
  counterpartyId: string;
  name: string;
  currency: string;
  decimals: number;
  /** A debt balance: positive means they owe you (§6.6). */
  balance: money.Money;
};

export type OpenDebtsCardProps = {
  lines: readonly OpenDebtsCardLine[];
  /** Opens the person (S13). */
  onOpenCounterparty: (counterpartyId: string) => void;
};

export function OpenDebtsCard({ lines, onOpenCounterparty }: OpenDebtsCardProps) {
  const t = useT();
  if (lines.length === 0) return null;
  return (
    <Card title={t("dashboard.openDebts")}>
      <View>
        {lines.map((line, index) => (
          <OpenDebtRow key={line.key} line={line} first={index === 0} onOpen={onOpenCounterparty} />
        ))}
      </View>
    </Card>
  );
}

type OpenDebtRowProps = {
  line: OpenDebtsCardLine;
  first: boolean;
  onOpen: (counterpartyId: string) => void;
};

function OpenDebtRow({ line, first, onOpen }: OpenDebtRowProps) {
  const t = useT();
  const mark = decimalMark(useLocale());
  const styles = useStyles();
  const { focused, handlers } = useInteraction();
  const press = usePressScale();
  // What a screen reader says for the whole line: who, which way, how much.
  const label = [
    line.name,
    t(
      money.debtDirection(line.balance, line.decimals) === "youOwe"
        ? "counterparties.youOwe"
        : "counterparties.owesYou",
    ),
    `${money.forDisplay(money.abs(line.balance), line.decimals, mark)}\u00a0${line.currency}`,
  ].join(", ");
  const { counterpartyId } = line;
  const handlePress = useCallback(() => onOpen(counterpartyId), [onOpen, counterpartyId]);
  return (
    <Animated.View style={press.style}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={label}
        onPress={handlePress}
        onPressIn={press.onPressIn}
        onPressOut={press.onPressOut}
        {...handlers}
        style={[styles.row, first ? null : styles.separated, focused ? styles.focused : null]}
      >
        <View style={styles.who}>
          <Text style={styles.name} numberOfLines={1}>
            {line.name}
          </Text>
          <DebtDirectionTag balance={line.balance} decimals={line.decimals} />
        </View>
        <Amount value={money.abs(line.balance)} currency={line.currency} decimals={line.decimals} />
      </Pressable>
    </Animated.View>
  );
}

const useStyles = makeStyles((theme) => ({
  row: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: space.md,
    minHeight: touchTarget.min,
    paddingVertical: space.md,
  },
  separated: { borderTopWidth: hairline.width, borderTopColor: theme.hairline },
  focused: {
    outlineWidth: focus.width,
    outlineColor: theme.focusRing,
    outlineOffset: focus.offset,
  },
  who: { flexDirection: "row", alignItems: "center", gap: space.md, flexShrink: 1 },
  name: { color: theme.text, ...text.ui("body", 600), flexShrink: 1 },
}));
