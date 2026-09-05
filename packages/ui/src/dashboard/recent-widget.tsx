/**
 * `<RecentWidget>` — `S01` §4/§14.5's `recent` widget.
 *
 * **Its own row, not `transactions/transaction-list.tsx`'s `TransactionList`.**
 * Same reason `balances-widget.tsx` draws its own line rather than reaching
 * for `BalanceRow`: `tests/module-boundaries.test.ts` refuses a domain-to-
 * domain relative import inside `packages/ui/src`, and this row needs none of
 * `TransactionRow`'s duplicate/business/split chrome — a dashboard card names
 * the payee, the category or account, and the figure.
 */

import type * as money from "@waltning/core/money";
import { useCallback } from "react";
import { Pressable, Text, View } from "react-native";
import { Amount, type AmountKind } from "../fx/amount";
import { useInteraction } from "../primitives/interaction.ts";
import { text } from "../theme/fonts.ts";
import { makeStyles } from "../theme/styles.ts";
import { focus, hairline, space, touchTarget } from "../tokens.ts";
import { WidgetCard, type WidgetFrame } from "./widget-card";

export type RecentWidgetRow = {
  id: string;
  payee: string;
  /** Category, or the account name when there is none — same fallback the meta line elsewhere uses. */
  meta: string;
  amount: money.Money;
  currency: string;
  decimals: number;
  kind: AmountKind;
};

export type RecentWidgetProps = WidgetFrame & {
  title: string;
  rows: readonly RecentWidgetRow[];
  emptyLabel: string;
  loading?: boolean | undefined;
  error?: string | undefined;
  /** S09's detail screen — present only where a tap opens something. */
  onPress?: (id: string) => void;
};

function Row({ row, onPress }: { row: RecentWidgetRow; onPress?: (id: string) => void }) {
  const styles = useStyles();
  const { focused, handlers } = useInteraction();
  const handlePress = useCallback(() => onPress?.(row.id), [onPress, row.id]);
  const body = (
    <View style={styles.rowBody}>
      <View style={styles.rowText}>
        <Text style={styles.payee}>{row.payee}</Text>
        <Text style={styles.rowMeta}>{row.meta}</Text>
      </View>
      <Amount
        value={row.amount}
        currency={row.currency}
        decimals={row.decimals}
        size="body"
        kind={row.kind}
      />
    </View>
  );

  if (!onPress) return body;

  return (
    <Pressable
      onPress={handlePress}
      style={focused ? [styles.pressable, styles.rowFocused] : styles.pressable}
      {...handlers}
    >
      {body}
    </Pressable>
  );
}

export function RecentWidget({
  title,
  currency,
  period,
  scope,
  rows,
  emptyLabel,
  loading,
  error,
  onPress,
}: RecentWidgetProps) {
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
            <View key={row.id} style={index === 0 ? undefined : styles.separated}>
              <Row row={row} {...(onPress ? { onPress } : {})} />
            </View>
          ))}
        </View>
      )}
    </WidgetCard>
  );
}

const useStyles = makeStyles((theme) => ({
  rowBody: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingVertical: space.xs,
    gap: space.md,
  },
  pressable: { justifyContent: "center", minHeight: touchTarget.min },
  rowFocused: {
    outlineWidth: focus.width,
    outlineColor: theme.focusRing,
    outlineOffset: focus.offset,
  },
  rowText: { flexShrink: 1, gap: space.xxs },
  separated: { borderTopWidth: hairline.width, borderTopColor: theme.hairline },
  payee: { color: theme.text, ...text.ui("body") },
  rowMeta: { color: theme.textMuted, ...text.ui("caption") },
  empty: { color: theme.textMuted, ...text.ui("body") },
}));
