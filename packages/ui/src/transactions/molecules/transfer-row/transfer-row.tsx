/**
 * `<TransferRow>` — S10 §3, §8: "a transfer is one row. Rendering two would
 * reintroduce the exact defect the data model exists to remove."
 *
 * Both accounts, both legs. **Both amounts render in their own currency**,
 * even when the two legs share one — the honest generalisation of the mock's
 * single trailing symbol, and the only rendering that stays correct for a
 * cross-currency transfer (`4a`'s FX margin), which is exactly the case a
 * shared-symbol shorthand would render wrong.
 *
 * **The destination leads, and the pair sits under it.** S10's drawing gives a
 * transfer the two-line identity every other row has — *To Savings* over
 * *Transfer · Bank A → Savings* — and this row drew the pair on one line under
 * `numberOfLines={1}`. Two real account names plus two amounts never fit 390pt,
 * so the line tail-truncated to *Bank A · P…* and ate the destination: the half
 * of a transfer that says where the money went, cut from the row that exists to
 * say it.
 *
 * **`kind="transfer"` on both legs** (`TransactionRow`'s own reasoning):
 * a transfer moves money between your own accounts, so it is neither a gain
 * nor a loss, and the sign-based `auto` colour would paint one leg green and
 * the other red for exactly that reason.
 */

import type * as money from "@waltning/core/money";
import { Text, View } from "react-native";
import { Amount } from "../../../fx/atoms/amount/amount";
import { useT } from "../../../i18n/provider";
import { text } from "../../../theme/fonts.ts";
import { makeStyles } from "../../../theme/styles.ts";
import { space, tabularNums } from "../../../tokens.ts";

export type TransferRowProps = {
  /** Bare `YYYY-MM-DD`. Rendered as given — never through a `Date` (C28). */
  date: string;
  fromAccountName: string;
  toAccountName: string;
  /** Already signed — negative, the outgoing leg. */
  amount: money.Money;
  currency: string;
  decimals?: number;
  /** Already signed — positive, the incoming leg. */
  toAmount: money.Money;
  toCurrency: string;
  toDecimals?: number;
};

export function TransferRow({
  date,
  fromAccountName,
  toAccountName,
  amount,
  currency,
  decimals = 2,
  toAmount,
  toCurrency,
  toDecimals = 2,
}: TransferRowProps) {
  const t = useT();
  const styles = useStyles();
  const arrow = t("transactions.transferArrow");

  return (
    <View style={styles.row}>
      <Text style={styles.date}>{date.slice(5)}</Text>
      <View style={styles.identity}>
        <Text style={styles.destination} numberOfLines={1}>
          {t("transactions.transferTo", { account: toAccountName })}
        </Text>
        <Text style={styles.accounts} numberOfLines={1}>
          {t("transactions.transferKind")} · {fromAccountName} {arrow} {toAccountName}
        </Text>
      </View>
      <View style={styles.amounts}>
        <Amount
          value={amount}
          currency={currency}
          decimals={decimals}
          size="small"
          kind="transfer"
        />
        <Text style={styles.arrow}>{arrow}</Text>
        <Amount
          value={toAmount}
          currency={toCurrency}
          decimals={toDecimals}
          size="small"
          kind="transfer"
        />
      </View>
    </View>
  );
}

const useStyles = makeStyles((theme) => ({
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: space.xl,
    paddingVertical: space.lg,
  },
  date: {
    color: theme.textMuted,
    ...text.ui("caption"),
    width: 44,
    fontVariant: [...tabularNums],
  },
  identity: { flex: 1, gap: space.xxs },
  destination: { color: theme.text, ...text.ui("bodySm", 600) },
  accounts: { color: theme.textMuted, ...text.ui("caption") },
  amounts: { flexDirection: "row", alignItems: "center", gap: space.sm },
  arrow: { color: theme.textMuted, ...text.ui("caption") },
}));
