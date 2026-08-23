import { useAppearance } from "@waltning/client/appearance/use-appearance";
import { usePhoneLedger } from "@waltning/client/ledger/use-phone-ledger";
import { Amount } from "@waltning/ui/fx/amount";
import { Card } from "@waltning/ui/shell/card";
import { TodayFrame } from "@waltning/ui/shell/today-frame";
import { EmptyState } from "@waltning/ui/states/empty-state";
import { TransactionRow } from "@waltning/ui/transactions/transaction-row";
import { router, useLocalSearchParams } from "expo-router";
import { useCallback } from "react";
import { useColorScheme } from "react-native";
import { requirePhoneLedger } from "./phone-ledger";
import { appearance, PREVIEW_RESET_ENABLED } from "./platform";
import { PreviewAppearanceControls } from "./preview-appearance-controls";

function handleCreateAccount() {
  router.push({ pathname: "/account/new", params: { returnTo: "today" } });
}

function handlePreference(next: "system" | "light" | "dark") {
  return appearance.setPreference(next);
}

function handleAdd() {
  router.push("/quick-add");
}

const CREATE_ACCOUNT_ACTION = { label: "Create account", onPress: handleCreateAccount };

export default function Today() {
  const ledger = requirePhoneLedger();
  const snapshot = usePhoneLedger(ledger);
  const systemScheme = useColorScheme();
  const resolved = useAppearance(
    appearance,
    systemScheme === "light" || systemScheme === "dark" ? systemScheme : null,
  );
  const { message } = useLocalSearchParams<{ message?: string }>();
  const hasAccounts = snapshot.accounts.length > 0;
  const handleReset = useCallback(() => ledger.reset(), [ledger]);

  const ledgerBody = hasAccounts ? (
    <Card title="Recent">
      {snapshot.recent.map((transaction) => (
        <TransactionRow
          key={transaction.id}
          date={transaction.date}
          payee={transaction.payee}
          category={transaction.categoryName}
          account={transaction.accountName}
          amount={transaction.amount}
          currency={transaction.currency}
          decimals={transaction.decimals}
          isBusiness={transaction.isBusiness}
        />
      ))}
    </Card>
  ) : (
    <EmptyState
      title="No accounts yet"
      body="Create one account to start your phone ledger."
      primaryAction={CREATE_ACCOUNT_ACTION}
    />
  );
  const body = (
    <>
      {typeof message === "string" ? <Card title={message}>{null}</Card> : null}
      {ledgerBody}
    </>
  );

  return (
    <TodayFrame
      appearanceAction={
        <PreviewAppearanceControls
          preference={resolved.preference}
          resetEnabled={PREVIEW_RESET_ENABLED}
          onPreference={handlePreference}
          onReset={handleReset}
        />
      }
      total={
        <Amount value={snapshot.total} currency="USD" decimals={2} size="hero" emphasis="shell" />
      }
      body={body}
      addDisabled={!hasAccounts}
      onAdd={handleAdd}
    />
  );
}
