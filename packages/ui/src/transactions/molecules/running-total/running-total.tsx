/**
 * `<RunningTotal>` — S10 §3 and §9's header figure: how many rows match, and
 * what they come to in each currency they are held in.
 *
 * **One line per currency, never a converted single figure.** §7 keeps a
 * ledger's totals in the money they were recorded in; adding EUR to PLN at
 * today's rate would state a number nobody transacted.
 */

import type { CurrencyCode, Money } from "@waltning/core/money";
import * as money from "@waltning/core/money";
import { Text, View } from "react-native";
import { Amount } from "../../../fx/atoms/amount/amount";
import { decimalMark } from "../../../i18n/locales.ts";
import { useLocale, useT } from "../../../i18n/provider";
import { Skeleton } from "../../../states/atoms/skeleton/skeleton";
import { text } from "../../../theme/fonts.ts";
import { makeStyles } from "../../../theme/styles.ts";
import { space } from "../../../tokens.ts";

/** One currency's own total, as `computations.md` §9 hands it over. */
export type RunningTotalCurrency = {
  currency: CurrencyCode;
  decimals: number;
  sum: Money;
  sumExcludingCapital: Money;
  capitalCount: number;
};

export type RunningTotalProps = {
  total: { count: number; currencies: readonly RunningTotalCurrency[] };
  /**
   * How many rows are actually loaded. Equal to `total.count` once the desk
   * drain has run to the end, and less than it when the drain hit its cap —
   * in which case the header says both numbers rather than the one that is no
   * longer true of what is on screen (C1, round 1). Absent on the phone, whose
   * list pages and whose count has always meant "matching", not "loaded".
   */
  shown?: number;
};

export function RunningTotal({ total, shown }: RunningTotalProps) {
  const t = useT();
  const styles = useStyles();
  if (total.count === 0) return null;
  const countLabel =
    shown !== undefined && shown < total.count
      ? t("transactions.showingOfTotal", { shown, count: total.count })
      : total.count === 1
        ? t("transactions.totalCountOne", { count: total.count })
        : t("transactions.totalCountMany", { count: total.count });

  return (
    <View style={styles.total}>
      <Text style={styles.count}>{countLabel}</Text>
      {total.currencies.map((currency) => (
        <CurrencyTotalLine key={currency.currency} currency={currency} />
      ))}
    </View>
  );
}

function CurrencyTotalLine({ currency }: { currency: RunningTotalCurrency }) {
  const t = useT();
  const locale = useLocale();
  const styles = useStyles();
  const amount = money.forDisplay(
    currency.sumExcludingCapital,
    currency.decimals,
    decimalMark(locale),
  );
  return (
    <View style={styles.line}>
      <Amount
        value={currency.sum}
        currency={currency.currency}
        decimals={currency.decimals}
        size="large"
      />
      {currency.capitalCount > 0 ? (
        <Text style={styles.excluding}>
          {currency.capitalCount === 1
            ? t("transactions.totalExcludingCapitalOne", { amount, count: currency.capitalCount })
            : t("transactions.totalExcludingCapitalMany", { amount, count: currency.capitalCount })}
        </Text>
      ) : null}
    </View>
  );
}

/** The header's own placeholder, so the total's height does not appear late. */
export function RunningTotalSkeleton() {
  const t = useT();
  return <Skeleton shape="row" label={t("transactions.loadingTransactions")} />;
}

const useStyles = makeStyles((theme) => ({
  total: { gap: space.xs },
  count: { color: theme.textMuted, ...text.ui("bodySm", 600) },
  line: { gap: space.xs },
  excluding: { color: theme.textMuted, ...text.ui("caption") },
}));
