/**
 * Accounts and their balances — a first slice of S16.
 *
 * Props only, no fetching, so this renders in a test and offline from the
 * replica. Each balance is in **its own account's currency** and they are never
 * added together: §3's net worth is a separate figure that converts first, and
 * summing these would silently add złoty to dollars.
 */

import { money } from "@waltning/core";
import { StyleSheet, Text, View } from "react-native";
import type { Account } from "../../api/use-accounts.ts";

export function AccountList({ accounts }: { accounts: readonly Account[] }) {
  if (accounts.length === 0) {
    return <Text style={styles.empty}>No accounts yet.</Text>;
  }

  return (
    <View style={styles.list}>
      {accounts.map((account) => {
        // `cmp` rather than a `startsWith("-")`: a balance of `-0.00000000` is
        // not negative, and string inspection says it is.
        const negative = money.cmp(account.balance, "0") < 0;
        return (
          <View key={account.id} style={styles.row}>
            <View style={styles.identity}>
              <Text style={styles.name}>{account.name}</Text>
              <Text style={styles.kind}>{account.kind}</Text>
            </View>
            <Text style={[styles.amount, negative && styles.negative]}>
              {money.toMoney(account.balance, account.decimals)}
            </Text>
            <Text style={styles.currency}>{account.currency}</Text>
          </View>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  list: { alignSelf: "stretch", gap: 2 },
  row: { flexDirection: "row", alignItems: "baseline", gap: 10, paddingVertical: 7 },
  identity: { flex: 1, flexDirection: "row", alignItems: "baseline", gap: 8 },
  name: { fontSize: 15 },
  kind: { fontSize: 11, opacity: 0.45, textTransform: "uppercase", letterSpacing: 0.4 },
  amount: { fontSize: 15, fontVariant: ["tabular-nums"] },
  negative: { color: "#b3261e" },
  currency: { fontSize: 11, opacity: 0.5, width: 32 },
  empty: { opacity: 0.6 },
});
