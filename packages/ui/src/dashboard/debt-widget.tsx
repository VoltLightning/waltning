/**
 * `<DebtWidget>` — `S01` §3/§4/§14.5's `debt` widget: E3's two direction
 * totals (`money.directionTotals`), per currency. **Never nets across people
 * or currencies** (§6.6, S12 §8) — the same rule `debt-screen.tsx` states for
 * the full S12 list holds here, at the summary's own scale.
 */

import type * as money from "@waltning/core/money";
import { Text, View } from "react-native";
import { Amount } from "../fx/amount";
import { text } from "../theme/fonts.ts";
import { makeStyles } from "../theme/styles.ts";
import { hairline, space } from "../tokens.ts";
import { WidgetCard, type WidgetFrame } from "./widget-card";

export type DebtWidgetProps = WidgetFrame & {
  title: string;
  totals: readonly money.DirectionTotalRow[];
  theyOweLabel: string;
  youOweLabel: string;
  emptyLabel: string;
  loading?: boolean | undefined;
  error?: string | undefined;
};

export function DebtWidget({
  title,
  currency,
  period,
  scope,
  totals,
  theyOweLabel,
  youOweLabel,
  emptyLabel,
  loading,
  error,
}: DebtWidgetProps) {
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
      {totals.length === 0 ? (
        <Text style={styles.empty}>{emptyLabel}</Text>
      ) : (
        <View>
          {totals.map((row, index) => (
            <View
              key={row.currency}
              style={index === 0 ? styles.group : [styles.group, styles.separated]}
            >
              <View style={styles.line}>
                <Text style={styles.label}>{theyOweLabel}</Text>
                <Amount
                  value={row.theyOwe}
                  currency={row.currency}
                  decimals={row.decimals}
                  size="body"
                  kind="income"
                />
              </View>
              <View style={styles.line}>
                <Text style={styles.label}>{youOweLabel}</Text>
                <Amount
                  value={row.youOwe}
                  currency={row.currency}
                  decimals={row.decimals}
                  size="body"
                  kind="spend"
                />
              </View>
            </View>
          ))}
        </View>
      )}
    </WidgetCard>
  );
}

const useStyles = makeStyles((theme) => ({
  group: { gap: space.xxs, paddingVertical: space.xs },
  separated: { borderTopWidth: hairline.width, borderTopColor: theme.hairline },
  line: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  label: { color: theme.textMuted, ...text.ui("body") },
  empty: { color: theme.textMuted, ...text.ui("body") },
}));
