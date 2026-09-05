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
 * **`BrandIcon` sits here, not in `FieldsCard`'s Payee row (`SPEC.md`
 * §14.4b).** `FieldsCard` draws every field through one generic labelled-row
 * renderer; singling out Payee for an icon slot would be a special case in a
 * component built specifically to avoid one field-row from another. This
 * screen's one identity anchor already exists — the hero — so the mark
 * lives beside it, the same "amount resolves first" reasoning this file
 * already states, extended to "and here is what it was for".
 */

import type * as money from "@waltning/core/money";
import { Text, View } from "react-native";
import { Amount } from "../fx/amount";
import { text } from "../theme/fonts.ts";
import { makeStyles } from "../theme/styles.ts";
import { space } from "../tokens.ts";
import { BrandIcon } from "./brand-icon";
import { TRANSACTION_AMOUNT_KIND, type TransactionType } from "./transaction-row";

export type TransactionHeroProps = {
  /** Already signed — same rule as `TransactionRow` and `readTransaction`. */
  amount: money.Money;
  currency: string;
  decimals?: number;
  type?: TransactionType;
  accountName: string;
  /** Drives `BrandIcon`'s fallback monogram when nothing matched. Absent renders no icon at all — same "absent means unread, not unmatched" rule `TransactionRow` states for its own `brandKey`. */
  payee?: string;
  brandKey?: string | null;
};

export function TransactionHero({
  amount,
  currency,
  decimals = 2,
  type,
  accountName,
  payee,
  brandKey,
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
      <View style={styles.subtitleRow}>
        {payee === undefined ? null : (
          <BrandIcon {...(brandKey !== undefined ? { brandKey } : {})} payee={payee} size={20} />
        )}
        <Text style={styles.subtitle}>
          {accountName} · {currency}
        </Text>
      </View>
    </View>
  );
}

const useStyles = makeStyles((theme) => ({
  root: { gap: space.xs },
  subtitleRow: { flexDirection: "row", alignItems: "center", gap: space.sm },
  subtitle: { color: theme.textMuted, ...text.ui("body") },
}));
