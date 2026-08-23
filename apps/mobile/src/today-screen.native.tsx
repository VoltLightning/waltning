import { useAppearance } from "@waltning/client/appearance";
import { usePhoneLedger } from "@waltning/client/ledger";
import { Amount, Card, EmptyState, TodayFrame, TransactionRow } from "@waltning/ui";
import { router, useLocalSearchParams } from "expo-router";
import { useColorScheme } from "react-native";
import { requirePhoneLedger } from "./phone-ledger";
import { appearance, PREVIEW_RESET_ENABLED } from "./platform";
import { PreviewAppearanceControls } from "./preview-appearance-controls";

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
      primaryAction={{
        label: "Create account",
        onPress: () => router.push({ pathname: "/account/new", params: { returnTo: "today" } }),
      }}
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
          onPreference={(next) => appearance.setPreference(next)}
          onReset={() => ledger.reset()}
        />
      }
      total={
        <Amount value={snapshot.total} currency="USD" decimals={2} size="hero" emphasis="shell" />
      }
      body={body}
      addDisabled={!hasAccounts}
      onAdd={() => router.push("/quick-add")}
    />
  );
}
