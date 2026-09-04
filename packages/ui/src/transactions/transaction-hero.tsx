/**
 * `<TransactionHero>` — `screens/S09-transaction-detail.md` §3 mobile: the
 * amount resolves first, because it is the anchor a person scans for before
 * anything else on the screen.
 *
 * **`FxAmount`'s full basis is not here.** S09 §3 shows a second line —
 * `62,40 $ · 4,0231 · 251,04 zł`, the rate and its provenance — for a foreign
 * capture. `wave-3-shared.md` names that block unbuilt this wave (no rate
 * table until `#e3`), so the hero is exactly the row's own currency, never a
 * conversion this screen has no basis for.
 */

import type * as money from "@waltning/core/money";
import { Text, View } from "react-native";
import { Amount } from "../fx/amount";
import { text } from "../theme/fonts.ts";
import { makeStyles } from "../theme/styles.ts";
import { space } from "../tokens.ts";
import { TRANSACTION_AMOUNT_KIND, type TransactionType } from "./transaction-row";

export type TransactionHeroProps = {
  /** Already signed — same rule as `TransactionRow` and `readTransaction`. */
  amount: money.Money;
  currency: string;
  decimals?: number;
  type?: TransactionType;
  accountName: string;
};

export function TransactionHero({
  amount,
  currency,
  decimals = 2,
  type,
  accountName,
}: TransactionHeroProps) {
  const styles = useStyles();

  return (
    <View style={styles.root}>
      <Amount
        value={amount}
        currency={currency}
        decimals={decimals}
        size="hero"
        kind={type ? TRANSACTION_AMOUNT_KIND[type] : "auto"}
      />
      <Text style={styles.subtitle}>
        {accountName} · {currency}
      </Text>
    </View>
  );
}

const useStyles = makeStyles((theme) => ({
  root: { gap: space.xs },
  subtitle: { color: theme.textMuted, ...text.ui("body") },
}));
