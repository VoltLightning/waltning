/**
 * `<TransactionRow>` and `<BalanceRow>` — `design-system/05` §5.2.
 *
 * These are the two rows the dashboard invented before the design system
 * existed, and the reason `12-build-order.md` puts components first: built per
 * screen they become near-duplicates that drift, and the drift is in how money
 * is rendered.
 *
 * **Both render every figure through `Amount` or `FxAmount`.** Neither formats
 * money itself, and `conformance.test.ts` refuses to let them start.
 */

import type { money } from "@waltning/core";
import { StyleSheet, Text, View } from "react-native";
import { Tag } from "../atoms/tag";
import { color, hairline, space, tabularNums, type } from "../tokens.ts";
import { Amount } from "./amount";
import { FxAmount, type FxProvenance } from "./fx-amount";

export type TransactionRowProps = {
  /** Bare `YYYY-MM-DD`. Rendered as given — never through a `Date` (C28). */
  date: string;
  payee: string;
  category?: string | null;
  account?: string | null;
  /** **Already signed** per `computations.md` §1. This row does not decide. */
  amount: money.Money;
  currency: string;
  decimals?: number;
  /** §3.3: appears in **every** view a business row appears in. */
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
          {/* A row with no payee reads as missing data; imported rows often
              have none, so the type is the fallback rather than a blank. */}
          <Text style={styles.payee}>{payee || "—"}</Text>
          {isBusiness ? <Tag variant="biz">biz</Tag> : null}
        </View>
        {meta ? <Text style={styles.meta}>{meta}</Text> : null}
      </View>
      <Amount value={amount} currency={currency} decimals={decimals} size="small" />
    </View>
  );
}

export type BalanceRowProps = {
  account: string;
  kind: string;
  balance: money.Money;
  currency: string;
  decimals?: number;
  /**
   * Present when this account is **not** in the display currency.
   *
   * Its presence is what selects `FxAmount`, so a foreign balance cannot be
   * rendered as a bare number: the rate is required to build it at all (P1).
   */
  conversion?: {
    rate: money.Money;
    displayCurrency: string;
    displayDecimals?: number;
    provenance?: FxProvenance;
  };
};

export function BalanceRow({
  account,
  kind,
  balance,
  currency,
  decimals = 2,
  conversion,
}: BalanceRowProps) {
  return (
    <View style={styles.row}>
      <View style={styles.identity}>
        <Text style={styles.payee}>{account}</Text>
        <Text style={styles.meta}>{kind}</Text>
      </View>
      {conversion ? (
        <FxAmount
          value={balance}
          currency={currency}
          decimals={decimals}
          rate={conversion.rate}
          displayCurrency={conversion.displayCurrency}
          displayDecimals={conversion.displayDecimals ?? 2}
          provenance={conversion.provenance ?? { kind: "synced" }}
        />
      ) : (
        <Amount value={balance} currency={currency} decimals={decimals} />
      )}
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
