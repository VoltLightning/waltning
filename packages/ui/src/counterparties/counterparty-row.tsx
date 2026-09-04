/**
 * `<CounterpartyRow>` — S12 §4, `design-system/05` §5.5.
 *
 * Monogram on a ramp tint · name · kind · `DebtDirectionTag` · net in
 * **their** settlement currency through `<FxAmount>` — the display-currency
 * equivalent renders only when the rate that produced it is on hand (P1); a
 * counterparty with no display rate shows the settlement figure alone,
 * through `<Amount>`, never a converted number without its basis.
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
import { makeStyles } from "../theme/styles.ts";
import { focus, radius, space, touchTarget } from "../tokens.ts";
import { AgeingBar } from "./ageing-bar";
import { DebtDirectionTag } from "./debt-direction-tag";
import { monogramFor } from "./monogram.ts";

export type CounterpartyKind = "person" | "company";

export type CounterpartyRowProps = {
  name: string;
  kind: CounterpartyKind;
  /** §6.6's net, in the counterparty's own settlement currency. */
  settlement: { value: Money; currency: string; decimals?: number };
  /** Present only when `readRate` answered for every currency involved (P1). */
  display?: { currency: string; rate: PivotPerUnit; decimals?: number } | null;
  /** Companies only (O15) — `null`/absent for a person or a company with nothing open. */
  ageDays?: number | null;
  ageBucket?: AgeBucket | null;
  onPress: () => void;
};

export function CounterpartyRow({
  name,
  kind,
  settlement,
  display,
  ageDays,
  ageBucket,
  onPress,
}: CounterpartyRowProps) {
  const t = useT();
  const styles = useStyles();
  const { hovered, focused, handlers } = useInteraction();
  const press = usePressScale();
  const handlePress = useCallback(() => onPress(), [onPress]);
  const monogram = monogramFor(name);
  const showAgeing = kind === "company" && ageDays != null && ageBucket != null;

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
        <View style={[styles.monogram, { backgroundColor: monogram.fill }]}>
          <Text style={[styles.monogramText, { color: monogram.ink }]}>{monogram.letter}</Text>
        </View>
        <View style={styles.identity}>
          <View style={styles.nameLine}>
            <Text style={styles.name} numberOfLines={1}>
              {name}
            </Text>
            <DebtDirectionTag balance={settlement.value} />
          </View>
          <Text style={styles.meta}>
            {t(kind === "company" ? "counterparties.kindCompany" : "counterparties.kindPerson")}
            {showAgeing ? "" : ` · ${t("counterparties.settlesIn", { currency: settlement.currency })}`}
          </Text>
          {showAgeing && ageDays != null && ageBucket != null ? (
            <AgeingBar ageDays={ageDays} bucket={ageBucket} />
          ) : null}
        </View>
        <View style={styles.figure}>
          {display ? (
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
    borderRadius: radius.pill,
    alignItems: "center",
    justifyContent: "center",
  },
  monogramText: { ...text.ui("body", 600) },
  identity: { flex: 1, gap: space.xs },
  nameLine: { flexDirection: "row", alignItems: "center", gap: space.md },
  name: { flexShrink: 1, color: theme.text, ...text.ui("body", 600) },
  meta: { color: theme.textMuted, ...text.ui("caption") },
  figure: { alignItems: "flex-end" },
}));
