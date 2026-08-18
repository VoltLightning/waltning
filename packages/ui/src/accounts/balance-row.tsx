/**
 * `<BalanceRow>` — `design-system/05` §5.2: account · kind · `FxAmount` for
 * foreign accounts.
 *
 * **`FxAmount` is selected by the *presence* of a conversion**, not by a flag.
 * A foreign balance therefore cannot be rendered as a bare converted number:
 * building the component at all requires the rate (P1).
 */

import type { money } from "@waltning/core";
import { StyleSheet, Text, View } from "react-native";
import { Amount } from "../fx/amount";
import { FxAmount, type FxProvenance } from "../fx/fx-amount";
import { color, hairline, space, type } from "../tokens.ts";

export type BalanceRowProps = {
  account: string;
  kind: string;
  balance: money.Money;
  currency: string;
  decimals?: number;
  /** Present only when this account is not in the display currency. */
  conversion?: {
    rate: money.Money;
    displayCurrency: string;
    displayDecimals?: number;
    provenance?: FxProvenance;
  };
};

export function BalanceRow({
  account,
  kind,
  balance,
  currency,
  decimals = 2,
  conversion,
}: BalanceRowProps) {
  return (
    <View style={styles.row}>
      <View style={styles.identity}>
        <Text style={styles.name}>{account}</Text>
        <Text style={styles.meta}>{kind}</Text>
      </View>
      {conversion ? (
        <FxAmount
          value={balance}
          currency={currency}
          decimals={decimals}
          rate={conversion.rate}
          displayCurrency={conversion.displayCurrency}
          displayDecimals={conversion.displayDecimals ?? 2}
          provenance={conversion.provenance ?? { kind: "synced" }}
        />
      ) : (
        <Amount value={balance} currency={currency} decimals={decimals} />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: space.xl,
    paddingVertical: space.lg,
    borderBottomWidth: hairline.width,
    borderBottomColor: hairline.color,
  },
  identity: { flex: 1, gap: 2 },
  name: { color: color.ink, fontSize: type.bodySm.fontSize },
  meta: { color: color.muted, fontSize: type.caption.fontSize },
});
