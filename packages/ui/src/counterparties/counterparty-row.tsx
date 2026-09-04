/**
 * `<CounterpartyRow>` — S12 §4, `design-system/05` §5.5.
 *
 * Monogram on a ramp tint · name · kind · `DebtDirectionTag` · net in
 * **their** settlement currency through `<FxAmount>` — the display-currency
 * equivalent renders only when the rate that produced it is on hand (P1); a
 * counterparty with no display rate shows the settlement figure alone,
 * through `<Amount>`, never a converted number without its basis.
 *
 * **No net is a real state, not an error (P1).** `settlement.value` is
 * `null` when the cross-currency fold could not complete — a held currency
 * with no rate — and this never falls back to one currency's own balance
 * standing in for the whole position. Instead it shows every held balance
 * `balances` carries, stacked, each with its own `DebtDirectionTag`: the
 * reader sees the real, un-folded position rather than a number that looks
 * like a net and is not one.
 *
 * `AgeingBar` is **companies only** (O15) — the caller decides `kind`, this
 * component only renders it when both `kind === "company"` and an age was
 * actually resolved (a company that has never held an open `debt` row has
 * neither).
 */

import type { AgeBucket, Money, PivotPerUnit } from "@waltning/core/money";
import { useCallback } from "react";
import { Pressable, Text, View } from "react-native";
import Animated from "react-native-reanimated";
import { Amount } from "../fx/amount";
import { FxAmount } from "../fx/fx-amount";
import { useT } from "../i18n/provider";
import { useInteraction } from "../primitives/interaction.ts";
import { usePressScale } from "../primitives/press-scale.ts";
import { text } from "../theme/fonts.ts";
import { useTheme } from "../theme/provider";
import { makeStyles } from "../theme/styles.ts";
import { focus, radius, space, touchTarget } from "../tokens.ts";
import { AgeingBar } from "./ageing-bar";
import { DebtDirectionTag } from "./debt-direction-tag";
import { monogramFor } from "./monogram.ts";

export type CounterpartyKind = "person" | "company";

/** One held balance, as `balances` shows it when there is no net (P1). */
export type CounterpartyRowBalanceLine = {
  currency: string;
  balance: Money;
  decimals?: number;
};

export type CounterpartyRowProps = {
  name: string;
  kind: CounterpartyKind;
  /** §6.6's net, in the counterparty's own settlement currency — `null` when the fold is incomplete (P1). */
  settlement: { value: Money | null; currency: string; decimals?: number };
  /** Every held balance — rendered stacked, in place of the net, only when `settlement.value` is `null`. */
  balances?: readonly CounterpartyRowBalanceLine[];
  /** Present only when `readRate` answered for every currency involved (P1). */
  display?: { currency: string; rate: PivotPerUnit; decimals?: number } | null;
  /** Companies only (O15) — `null`/absent for a person or a company with nothing open. */
  ageDays?: number | null;
  ageBucket?: AgeBucket | null;
  onPress: () => void;
};

type StackedBalanceLineProps = { line: CounterpartyRowBalanceLine };

/** One `balances` line — its own figure and its own direction, no folding attempted. */
function StackedBalanceLine({ line }: StackedBalanceLineProps) {
  const styles = useStyles();
  return (
    <View style={styles.stackedLine}>
      <Amount value={line.balance} currency={line.currency} decimals={line.decimals ?? 2} />
      <DebtDirectionTag balance={line.balance} />
    </View>
  );
}

export function CounterpartyRow({
  name,
  kind,
  settlement,
  balances = [],
  display,
  ageDays,
  ageBucket,
  onPress,
}: CounterpartyRowProps) {
  const t = useT();
  const theme = useTheme();
  const styles = useStyles();
  const { hovered, focused, handlers } = useInteraction();
  const press = usePressScale();
  const handlePress = useCallback(() => onPress(), [onPress]);
  const monogram = monogramFor(name, theme);
  const showAgeing = kind === "company" && ageDays != null && ageBucket != null;
  // Computed rather than in `useStyles`, matching `tag.tsx`'s own `fill`/`ink`.
  const monogramFill = { backgroundColor: monogram.fill };
  const monogramInk = { color: monogram.ink };

  return (
    <Animated.View style={press.style}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={name}
        onPress={handlePress}
        onPressIn={press.onPressIn}
        onPressOut={press.onPressOut}
        {...handlers}
        style={[styles.row, hovered ? styles.hovered : null, focused ? styles.focused : null]}
      >
        <View style={[styles.monogram, monogramFill]}>
          <Text style={[styles.monogramText, monogramInk]}>{monogram.letter}</Text>
        </View>
        <View style={styles.identity}>
          <View style={styles.nameLine}>
            <Text style={styles.name} numberOfLines={1}>
              {name}
            </Text>
            {settlement.value === null ? null : <DebtDirectionTag balance={settlement.value} />}
          </View>
          <Text style={styles.meta}>
            {t(kind === "company" ? "counterparties.kindCompany" : "counterparties.kindPerson")}
            {showAgeing
              ? ""
              : ` · ${t("counterparties.settlesIn", { currency: settlement.currency })}`}
          </Text>
          {showAgeing && ageDays != null && ageBucket != null ? (
            <AgeingBar ageDays={ageDays} bucket={ageBucket} />
          ) : null}
        </View>
        <View style={styles.figure}>
          {settlement.value === null ? (
            balances.map((line) => <StackedBalanceLine key={line.currency} line={line} />)
          ) : display ? (
            <FxAmount
              value={settlement.value}
              currency={settlement.currency}
              rate={display.rate}
              displayCurrency={display.currency}
              decimals={settlement.decimals ?? 2}
              displayDecimals={display.decimals ?? 2}
            />
          ) : (
            <Amount
              value={settlement.value}
              currency={settlement.currency}
              decimals={settlement.decimals ?? 2}
            />
          )}
        </View>
      </Pressable>
    </Animated.View>
  );
}

const useStyles = makeStyles((theme) => ({
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: space.xl,
    paddingVertical: space.lg,
    minHeight: touchTarget.min,
  },
  hovered: { backgroundColor: theme.hoverFill },
  focused: {
    outlineWidth: focus.width,
    outlineColor: theme.focusRing,
    outlineOffset: focus.offset,
  },
  monogram: {
    width: 36,
    height: 36,
    borderRadius: radius.sm,
    alignItems: "center",
    justifyContent: "center",
  },
  monogramText: { ...text.ui("body", 600) },
  identity: { flex: 1, gap: space.xs },
  nameLine: { flexDirection: "row", alignItems: "center", gap: space.md },
  name: { flexShrink: 1, color: theme.text, ...text.ui("body", 600) },
  meta: { color: theme.textMuted, ...text.ui("caption") },
  figure: { alignItems: "flex-end", gap: space.xs },
  stackedLine: { flexDirection: "row", alignItems: "center", gap: space.sm },
}));
