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
 *
 * **The direction is said in words, above the figure.** *Went out* · *Came
 * in* — P5's rule that direction never rests on colour or a sign alone, and
 * S09's own drawing (`design/S09.html`) leads with it. A transfer says
 * neither: it left one account and arrived in another, and naming one side
 * would be picking a side.
 *
 * The identity strip pairs the brand mark with direction and account, above
 * the amount. The page header already names the transaction; repeating it
 * here would compete with the figure. This follows CounterpartyCard's strip.
 */

import type * as money from "@waltning/core/money";
import { Text, View } from "react-native";
import { Amount } from "../../../fx/atoms/amount/amount";
import { useT } from "../../../i18n/provider";
import { text } from "../../../theme/fonts.ts";
import { makeStyles } from "../../../theme/styles.ts";
import { space } from "../../../tokens.ts";
import { BrandIcon } from "../../atoms/brand-icon/brand-icon";
import {
  TRANSACTION_AMOUNT_KIND,
  type TransactionType,
} from "../../molecules/transaction-row/transaction-row";

export type TransactionHeroProps = {
  /** Already signed — same rule as `TransactionRow` and `readTransaction`. */
  amount: money.Money;
  currency: string;
  decimals?: number;
  type?: TransactionType;
  accountName: string;
  /** Drives `BrandIcon`'s fallback monogram when nothing matched. Absent renders no icon at all — same "absent means unread, not unmatched" rule `TransactionRow` states for its own `brandKey`. */
  enteredName?: string;
  brandKey?: string | null;
};

export function TransactionHero({
  amount,
  currency,
  decimals = 2,
  type,
  accountName,
  enteredName,
  brandKey,
}: TransactionHeroProps) {
  const styles = useStyles();
  const t = useT();
  const direction =
    type === "expense" ? "shell.wentOut" : type === "income" ? "shell.cameIn" : undefined;

  return (
    <View style={styles.root}>
      <View style={styles.identity}>
        {enteredName === undefined ? null : (
          <BrandIcon
            {...(brandKey !== undefined ? { brandKey } : {})}
            enteredName={enteredName}
            size={40}
          />
        )}
        <View style={styles.context}>
          {direction === undefined ? null : <Text style={styles.kicker}>{t(direction)}</Text>}
          <Text style={styles.subtitle}>
            {accountName} · {currency}
          </Text>
        </View>
      </View>
      <Amount
        value={amount}
        currency={currency}
        decimals={decimals}
        size="hero"
        kind={type ? TRANSACTION_AMOUNT_KIND[type] : "auto"}
      />
    </View>
  );
}

const useStyles = makeStyles((theme) => ({
  root: { gap: space.xl, paddingVertical: space.x3 },
  kicker: { color: theme.textMuted, ...text.ui("kicker") },
  identity: { flexDirection: "row", alignItems: "center", gap: space.xl },
  context: { flex: 1, gap: space.xxs },
  subtitle: { color: theme.textMuted, ...text.ui("body") },
}));
