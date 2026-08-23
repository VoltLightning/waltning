import { type AppearancePreference, useAppearance } from "@waltning/client/appearance";
import { usePhoneLedger } from "@waltning/client/ledger";
import {
  Amount,
  BottomSheet,
  Button,
  Card,
  EmptyState,
  SegmentControl,
  TodayFrame,
  TransactionRow,
} from "@waltning/ui";
import { router, useLocalSearchParams } from "expo-router";
import { useState } from "react";
import { useColorScheme } from "react-native";
import { requirePhoneLedger } from "../src/phone-ledger";
import { appearance, PREVIEW_RESET_ENABLED } from "../src/platform";

const APPEARANCE_CHOICES = [
  { value: "system", label: "System" },
  { value: "light", label: "Light" },
  { value: "dark", label: "Dark" },
] as const;

function isAppearancePreference(value: string): value is AppearancePreference {
  return value === "system" || value === "light" || value === "dark";
}

export default function Today() {
  const ledger = requirePhoneLedger();
  const snapshot = usePhoneLedger(ledger);
  const [sheet, setSheet] = useState<"closed" | "appearance" | "reset">("closed");
  const [appearanceError, setAppearanceError] = useState(false);
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
    <>
      <TodayFrame
        appearanceAction={
          <Button label="Appearance" onPress={() => setSheet("appearance")} variant="primary" />
        }
        total={
          <Amount value={snapshot.total} currency="USD" decimals={2} size="hero" emphasis="shell" />
        }
        body={body}
        addDisabled={!hasAccounts}
        onAdd={() => router.push("/quick-add")}
      />

      <BottomSheet
        visible={sheet !== "closed"}
        title={sheet === "reset" ? "Delete preview data" : "Appearance"}
        onDismiss={() => setSheet("closed")}
      >
        {sheet === "reset" ? (
          <>
            <Card title="Delete every account and transaction from this phone?">{null}</Card>
            <Button label="Cancel" onPress={() => setSheet("appearance")} variant="ghost" />
            <Button
              label="Delete preview data"
              onPress={() => {
                ledger.reset();
                setSheet("closed");
              }}
              variant="danger"
            />
          </>
        ) : (
          <>
            <SegmentControl
              segments={APPEARANCE_CHOICES}
              value={resolved.preference}
              onChange={(next) => {
                if (!isAppearancePreference(next)) return;
                setAppearanceError(false);
                void appearance.setPreference(next).catch(() => setAppearanceError(true));
              }}
            />
            {appearanceError ? <Card title="Appearance could not be saved.">{null}</Card> : null}
            {PREVIEW_RESET_ENABLED ? (
              <Button
                label="Reset preview data"
                onPress={() => setSheet("reset")}
                variant="danger"
              />
            ) : null}
          </>
        )}
      </BottomSheet>
    </>
  );
}
