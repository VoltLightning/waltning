/**
 * The ledger, newest first — a first slice of S10.
 *
 * **The amount arrives already signed** (`computations.md` §1, computed once in
 * SQL). This component does not decide the sign from the type: that would be a
 * second implementation of §1, and the two would disagree on `adjustment`,
 * which carries its own sign.
 */

import { money } from "@waltning/core";
import { StyleSheet, Text, View } from "react-native";
import type { Transaction } from "../../api/use-transactions.ts";

export function TransactionList({ transactions }: { transactions: readonly Transaction[] }) {
  if (transactions.length === 0) {
    // Not a spinner and not a blank area. An empty ledger and a list that
    // failed to load look identical when a component renders nothing (§8).
    return <Text style={styles.empty}>No transactions yet.</Text>;
  }

  return (
    <View style={styles.list}>
      {transactions.map((t) => (
        <View key={t.id} style={styles.row}>
          <Text style={styles.date}>{t.date.slice(5)}</Text>
          <View style={styles.identity}>
            <Text style={styles.payee}>{t.payee || t.type}</Text>
            <Text style={styles.meta}>
              {t.accountName}
              {t.categoryName ? ` · ${t.categoryName}` : ""}
            </Text>
          </View>
          <Text style={[styles.amount, money.cmp(t.amount, "0") < 0 ? styles.out : styles.in]}>
            {money.toMoney(t.amount, 2)}
          </Text>
          <Text style={styles.currency}>{t.currency}</Text>
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  list: { alignSelf: "stretch", gap: 1 },
  row: { flexDirection: "row", alignItems: "baseline", gap: 10, paddingVertical: 6 },
  // The bare `MM-DD`: these are accounting dates, not moments, and rendering a
  // timezone onto one is how a capture lands on the wrong day (C28).
  date: { fontSize: 12, opacity: 0.5, width: 44, fontVariant: ["tabular-nums"] },
  identity: { flex: 1 },
  payee: { fontSize: 14 },
  meta: { fontSize: 11, opacity: 0.5 },
  amount: { fontSize: 14, fontVariant: ["tabular-nums"] },
  out: { color: "#b3261e" },
  in: { color: "#1b5e20" },
  currency: { fontSize: 11, opacity: 0.5, width: 32 },
  empty: { opacity: 0.6 },
});
