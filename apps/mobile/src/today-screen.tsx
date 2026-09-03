import { useAppearance } from "@waltning/client/appearance/use-appearance";
import type { PhoneRecentTransaction } from "@waltning/client/ledger/create-phone-ledger";
import { useLedgerController } from "@waltning/client/ledger/use-ledger-controller";
import { usePhoneLedger } from "@waltning/client/ledger/use-phone-ledger";
import { useT } from "@waltning/ui/i18n/provider";
import { Card } from "@waltning/ui/shell/card";
import { CurrencyTotals } from "@waltning/ui/shell/currency-totals";
import { TodayFrame } from "@waltning/ui/shell/today-frame";
import { EmptyState } from "@waltning/ui/states/empty-state";
import {
  TransactionList,
  type TransactionListItem,
} from "@waltning/ui/transactions/transaction-list";
import { router, useLocalSearchParams } from "expo-router";
import { useCallback, useMemo } from "react";
import { useColorScheme } from "react-native";
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

/**
 * The replica's row shape onto the list's. Named rather than inline because
 * `architecture/11` bans a function expression inside JSX — and because this is
 * the one place the ledger's field names and the component's meet.
 */
function toRow(transaction: PhoneRecentTransaction): TransactionListItem {
  return {
    id: transaction.id,
    date: transaction.date,
    payee: transaction.payee,
    category: transaction.categoryName,
    account: transaction.accountName,
    amount: transaction.amount,
    currency: transaction.currency,
    decimals: transaction.decimals,
    isBusiness: transaction.isBusiness,
  };
}

/**
 * One screen for both surfaces. The ledger arrives through context — provided
 * at the app boundary from whichever platform module Metro resolved — so
 * nothing in this file knows whether the rows below it live in an iOS
 * document directory or an OPFS pool.
 */
export default function Today() {
  const t = useT();
  const ledger = useLedgerController();
  // A label is a word, so the action cannot be a module constant any more —
  // `useT` is a hook. Memoised on `t` so the empty state is not handed a new
  // object on every render.
  const createAccountAction = useMemo(
    () => ({ label: t("routes.createAccount"), onPress: handleCreateAccount }),
    [t],
  );
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
    <Card title={t("shell.recent")}>
      <TransactionList transactions={snapshot.recent.map(toRow)} />
    </Card>
  ) : (
    <EmptyState
      title={t("shell.noAccounts")}
      body={t("shell.noAccountsBody")}
      primaryAction={createAccountAction}
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
      total={<CurrencyTotals subtotals={snapshot.subtotals} />}
      body={body}
      addDisabled={!hasAccounts}
      onAdd={handleAdd}
    />
  );
}
