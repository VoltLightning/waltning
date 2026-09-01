/**
 * The web dashboard — accounts, their balances, and the recent ledger.
 *
 * A first usable slice of S01. Not S01: the real one has the scope switch,
 * per-widget freshness and a configurable layout (§14.7, S24).
 *
 * **A screen composes and nothing else** (`architecture/11` §4). Every component
 * here comes from `@waltning/ui`, every hook from `@waltning/client`, and the
 * only local import is `../src/platform` — the platform variant that names Expo.
 * This file previously held a type, a hook, a component and a formatter, none
 * of which the test runner could see.
 */

import { useAccounts } from "@waltning/client/accounts/use-accounts";
import { describeProbe, useProbe } from "@waltning/client/connectivity/use-probe";
import { type Transaction, useTransactions } from "@waltning/client/transactions/use-transactions";
import { BalanceRow } from "@waltning/ui/accounts/balance-row";
import { useT } from "@waltning/ui/i18n/provider";
import { Card, GroundPanel } from "@waltning/ui/shell/card";
import {
  TransactionList,
  type TransactionListItem,
} from "@waltning/ui/transactions/transaction-list";
import { ScrollView, StyleSheet, Text, View } from "react-native";
import { API_BASE_URL, api, isStaleBundle } from "./platform";

export default function Dashboard() {
  const t = useT();
  const probe = useProbe(api);
  const accounts = useAccounts(api);
  const transactions = useTransactions(api, 20);

  return (
    <ScrollView contentContainerStyle={styles.screen}>
      <GroundPanel>
        <Text style={styles.title}>{t("common.appName")}</Text>

        <Card title={t("shell.accounts")}>
          {accounts.status === "loading" ? (
            <Text style={styles.detail}>{t("common.loading")}</Text>
          ) : null}
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
              <Text style={styles.note}>{t("shell.ownCurrency")}</Text>
            </>
          ) : null}
        </Card>

        <Card title={t("shell.recent")}>
          {transactions.status === "loading" ? (
            <Text style={styles.detail}>{t("common.loading")}</Text>
          ) : null}
          {transactions.status === "failed" ? (
            <Text style={styles.detail}>{transactions.error.message}</Text>
          ) : null}
          {transactions.status === "ready" ? (
            <>
              <TransactionList transactions={transactions.data.transactions.map(toRow)} />
              {transactions.data.hasMore ? (
                // Said plainly. A list that silently shows only the first page
                // reads as the whole ledger, and a short ledger is a wrong one.
                <Text style={styles.note}>{t("shell.morePages")}</Text>
              ) : null}
            </>
          ) : null}
        </Card>

        <View style={styles.connection}>
          <Text style={styles.detail}>{API_BASE_URL || t("shell.thisOrigin")}</Text>
          <Text style={styles.detail}>{describeProbe(probe, isStaleBundle)}</Text>
        </View>
      </GroundPanel>
    </ScrollView>
  );
}

/** The wire's row shape onto the list's. Named — no function expressions in JSX. */
function toRow(transaction: Transaction): TransactionListItem {
  return {
    id: transaction.id,
    date: transaction.date,
    payee: transaction.payee,
    category: transaction.categoryName,
    account: transaction.accountName,
    amount: transaction.amount,
    currency: transaction.currency,
  };
}

const styles = StyleSheet.create({
  screen: { flexGrow: 1, maxWidth: 640, width: "100%", alignSelf: "center" },
  title: { fontSize: 28, fontWeight: "600" },
  detail: { fontSize: 13, opacity: 0.7 },
  note: { fontSize: 11, opacity: 0.5, fontStyle: "italic" },
  connection: { gap: 4 },
});
