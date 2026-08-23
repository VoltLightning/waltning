/**
 * The dashboard — accounts, their balances, and the recent ledger.
 *
 * A first usable slice of S01. Not S01: the real one has the scope switch,
 * per-widget freshness and a configurable layout (§14.7, S24).
 *
 * **A route composes and nothing else** (`architecture/11` §4). Every component
 * here comes from `@waltning/ui`, every hook from `@waltning/client`, and the
 * only local import is `../src/platform` — the platform variant that names Expo.
 * This file previously held a type, a hook, a component and a formatter, none
 * of which the test runner could see.
 */

import { useAccounts } from "@waltning/client/accounts";
import { describeProbe, useProbe } from "@waltning/client/connectivity";
import { useTransactions } from "@waltning/client/transactions";
import { BalanceRow, Card, GroundPanel, TransactionRow } from "@waltning/ui";
import { ScrollView, StyleSheet, Text, View } from "react-native";
import { API_BASE_URL, api, isStaleBundle } from "../src/platform";

export default function Dashboard() {
  const probe = useProbe(api);
  const accounts = useAccounts(api);
  const transactions = useTransactions(api, 20);

  return (
    <ScrollView contentContainerStyle={styles.screen}>
      <GroundPanel>
        <Text style={styles.title}>Waltning</Text>

        <Card title="Accounts">
          {accounts.status === "loading" ? <Text style={styles.detail}>Loading…</Text> : null}
          {accounts.status === "failed" ? (
            <Text style={styles.detail}>{accounts.error.message}</Text>
          ) : null}
          {accounts.status === "ready" ? (
            <>
              {accounts.data.map((account) => (
                <BalanceRow
                  key={account.id}
                  account={account.name}
                  kind={account.kind}
                  balance={account.balance}
                  currency={account.currency}
                  decimals={account.decimals}
                />
              ))}
              {/*
                Stated rather than shown as a total. §3's net worth converts
                every balance to a display currency first; adding these would
                put złoty and dollars into one number and call it net worth.
              */}
              <Text style={styles.note}>
                Each balance is in its own account's currency — not a total.
              </Text>
            </>
          ) : null}
        </Card>

        <Card title="Recent">
          {transactions.status === "loading" ? <Text style={styles.detail}>Loading…</Text> : null}
          {transactions.status === "failed" ? (
            <Text style={styles.detail}>{transactions.error.message}</Text>
          ) : null}
          {transactions.status === "ready" ? (
            <>
              {transactions.data.transactions.map((t) => (
                <TransactionRow
                  key={t.id}
                  date={t.date}
                  payee={t.payee}
                  category={t.categoryName}
                  account={t.accountName}
                  amount={t.amount}
                  currency={t.currency}
                />
              ))}
              {transactions.data.hasMore ? (
                // Said plainly. A list that silently shows only the first page
                // reads as the whole ledger, and a short ledger is a wrong one.
                <Text style={styles.note}>More transactions exist — paging is not built yet.</Text>
              ) : null}
            </>
          ) : null}
        </Card>

        <View style={styles.connection}>
          <Text style={styles.detail}>{API_BASE_URL || "this origin"}</Text>
          <Text style={styles.detail}>{describeProbe(probe, isStaleBundle)}</Text>
        </View>
      </GroundPanel>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  screen: { flexGrow: 1, maxWidth: 640, width: "100%", alignSelf: "center" },
  title: { fontSize: 28, fontWeight: "600" },
  detail: { fontSize: 13, opacity: 0.7 },
  note: { fontSize: 11, opacity: 0.5, fontStyle: "italic" },
  connection: { gap: 4 },
});
