/**
 * `<BalanceLedger>` — `design-system/05` §5.5, the component that "justifies
 * the model change": one row per currency, then both derived totals.
 *
 * **Owns the sign.** Positive = they owe you, negative = you owe them (§6.6's
 * negation) — computed once here, through `DebtDirectionTag`, so no screen
 * has to remember or restate it. Direction is always in words (P5).
 *
 * **Neither derived total is stored** (§6.6) — both are handed in already
 * folded (`packages/client`'s `counterpartyNet`, over `readRate`), and
 * **`display` is `null` unless a rate answered** (`FxAmount` cannot render a
 * conversion without one — P1). A counterparty holding only their own
 * settlement currency has no display line to compute *and* needs no rate to
 * show `net`: `selected by presence`, the same rule `<BalanceRow>` already
 * follows for an account balance.
 */

import type { Money, PivotPerUnit } from "@waltning/core/money";
import { Text, View } from "react-native";
import { Amount } from "../fx/amount";
import { FxAmount } from "../fx/fx-amount";
import { useT } from "../i18n/provider";
import { text } from "../theme/fonts.ts";
import { makeStyles } from "../theme/styles.ts";
import { space } from "../tokens.ts";
import { DebtDirectionTag } from "./debt-direction-tag";

export type BalanceLedgerRow = {
  currency: string;
  balance: Money;
  decimals?: number;
};

export type BalanceLedgerProps = {
  /** One row per currency the counterparty holds a balance in (§6.6). */
  rows: readonly BalanceLedgerRow[];
  settlementCurrency: string;
  /** `null` when a currency this counterparty holds has no rate to fold into it (P1) — the row is omitted. */
  settlementNet: Money | null;
  settlementDecimals?: number;
  /** Present only when `readRate(settlement → display)` answered. */
  display?: { currency: string; rate: PivotPerUnit; decimals?: number } | null;
};

export function BalanceLedger({
  rows,
  settlementCurrency,
  settlementNet,
  settlementDecimals = 2,
  display,
}: BalanceLedgerProps) {
  const t = useT();
  const styles = useStyles();

  return (
    <View style={styles.root}>
      {rows.map((row) => (
        <View key={row.currency} style={styles.row}>
          <Amount value={row.balance} currency={row.currency} decimals={row.decimals ?? 2} />
          <DebtDirectionTag balance={row.balance} />
        </View>
      ))}
      {settlementNet === null ? null : (
        <View style={styles.netBlock}>
          <View style={styles.rule} />
          <View style={styles.netRow}>
            <Text style={styles.netLabel}>
              {t("counterparties.netIn", { currency: settlementCurrency })}
            </Text>
            {display ? (
              <FxAmount
                value={settlementNet}
                currency={settlementCurrency}
                rate={display.rate}
                displayCurrency={display.currency}
                decimals={settlementDecimals}
                displayDecimals={display.decimals ?? 2}
              />
            ) : (
              <Amount value={settlementNet} currency={settlementCurrency} decimals={settlementDecimals} />
            )}
          </View>
        </View>
      )}
    </View>
  );
}

const useStyles = makeStyles((theme) => ({
  root: { gap: space.md },
  row: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  netBlock: { gap: space.md },
  rule: { borderTopWidth: 1, borderTopColor: theme.border },
  netRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    flexWrap: "wrap",
    gap: space.md,
  },
  netLabel: { color: theme.textMuted, ...text.ui("bodySm", 600) },
}));
