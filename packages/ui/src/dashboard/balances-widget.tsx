/**
 * `<BalancesWidget>` — `S01` §4/§14.5's `balances` widget: A1's own balances,
 * one line per account.
 *
 * **Its own row, not `accounts/balance-row.tsx`'s `BalanceRow`.** That
 * component's `kind` tag is a translated label its own module resolves
 * (`account-register.tsx`'s `KIND_LABEL_KEY`), and `tests/module-boundaries.test.ts`
 * refuses a domain-to-domain import inside `packages/ui/src` — reaching for
 * it here would need exactly that. A compact dashboard line needs a name and
 * a figure, not the register's full row, so this draws its own.
 *
 * **No foreign-currency conversion** — arc-phone excludes FX entirely (the
 * same note `today-screen.tsx`'s hero carries), so every row renders in its
 * own account currency through a plain `<Amount>`, never `<FxAmount>`.
 */

import type * as money from "@waltning/core/money";
import { Text, View } from "react-native";
import { Amount } from "../fx/amount";
import { text } from "../theme/fonts.ts";
import { makeStyles } from "../theme/styles.ts";
import { hairline, space } from "../tokens.ts";
import { WidgetCard, type WidgetFrame } from "./widget-card";

export type BalancesWidgetRow = {
  id: string;
  name: string;
  balance: money.Money;
  currency: string;
  decimals: number;
};

export type BalancesWidgetProps = WidgetFrame & {
  title: string;
  rows: readonly BalancesWidgetRow[];
  emptyLabel: string;
  loading?: boolean | undefined;
  error?: string | undefined;
};

export function BalancesWidget({
  title,
  currency,
  period,
  scope,
  rows,
  emptyLabel,
  loading,
  error,
}: BalancesWidgetProps) {
  const styles = useStyles();

  return (
    <WidgetCard
      title={title}
      currency={currency}
      period={period}
      scope={scope}
      loading={loading}
      error={error}
    >
      {rows.length === 0 ? (
        <Text style={styles.empty}>{emptyLabel}</Text>
      ) : (
        <View>
          {rows.map((row, index) => (
            <View key={row.id} style={index === 0 ? styles.row : [styles.row, styles.separated]}>
              <Text style={styles.name}>{row.name}</Text>
              <Amount
                value={row.balance}
                currency={row.currency}
                decimals={row.decimals}
                size="body"
              />
            </View>
          ))}
        </View>
      )}
    </WidgetCard>
  );
}

const useStyles = makeStyles((theme) => ({
  row: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingVertical: space.xs,
  },
  separated: { borderTopWidth: hairline.width, borderTopColor: theme.hairline },
  name: { color: theme.text, ...text.ui("body") },
  empty: { color: theme.textMuted, ...text.ui("body") },
}));
