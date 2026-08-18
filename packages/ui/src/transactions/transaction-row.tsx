/**
 * `<TransactionRow>` — `design-system/05` §5.2.
 *
 * Date · payee · category · `Amount`, with the `BIZ` tag when the row is
 * business — §3.3 requires that marker in **every** view a business row appears
 * in, because a row marked in one list and bare in another ends as a tax figure
 * nobody can explain.
 *
 * Lived in a `molecules/rows.tsx` that also held `BalanceRow`: two domains in
 * one file, filed by size. §5.2's "Rows" heading is a shape, not a domain — the
 * eight components under it belong to six different ones.
 *
 * **The amount arrives already signed** (`computations.md` §1, computed once in
 * SQL). This does not decide the sign from the type: that would be a second
 * implementation, and the two disagree on `adjustment`, which carries its own.
 */

import type { money } from "@waltning/core";
import { StyleSheet, Text, View } from "react-native";
import { Amount } from "../fx/amount";
import { Tag } from "../primitives/tag";
import { color, hairline, space, tabularNums, type } from "../tokens.ts";

export type TransactionRowProps = {
  /** Bare `YYYY-MM-DD`. Rendered as given — never through a `Date` (C28). */
  date: string;
  payee: string;
  category?: string | null;
  account?: string | null;
  /** **Already signed** per §1. */
  amount: money.Money;
  currency: string;
  decimals?: number;
  isBusiness?: boolean;
};

export function TransactionRow({
  date,
  payee,
  category,
  account,
  amount,
  currency,
  decimals = 2,
  isBusiness = false,
}: TransactionRowProps) {
  const meta = [account, category].filter(Boolean).join(" · ");

  return (
    <View style={styles.row}>
      {/*
        The bare accounting date. These are `YYYY-MM-DD` strings, not moments —
        rendering one through a `Date` is how a capture lands on the wrong day
        when the phone is still on the previous timezone (C28).
      */}
      <Text style={styles.date}>{date.slice(5)}</Text>
      <View style={styles.identity}>
        <View style={styles.payeeLine}>
          {/* A blank row reads as missing data; imported rows often have no
              payee, so the fallback is a dash rather than nothing. */}
          <Text style={styles.payee}>{payee || "—"}</Text>
          {isBusiness ? <Tag variant="biz">biz</Tag> : null}
        </View>
        {meta ? <Text style={styles.meta}>{meta}</Text> : null}
      </View>
      <Amount value={amount} currency={currency} decimals={decimals} size="small" />
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
  date: {
    color: color.muted,
    fontSize: type.caption.fontSize,
    width: 44,
    fontVariant: [...tabularNums],
  },
  identity: { flex: 1, gap: 2 },
  payeeLine: { flexDirection: "row", alignItems: "center", gap: space.md },
  payee: { color: color.ink, fontSize: type.bodySm.fontSize },
  meta: { color: color.muted, fontSize: type.caption.fontSize },
});
