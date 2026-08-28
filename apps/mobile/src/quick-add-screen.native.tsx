import { parseQuickAddRoute } from "@waltning/client/ledger/preview-routes";
import { id } from "@waltning/core/id";
import { Card, GroundPanel } from "@waltning/ui/shell/card";
import { QuickAddForm } from "@waltning/ui/transactions/quick-add-form";
import { router, useLocalSearchParams } from "expo-router";
import { useCallback } from "react";
import { requirePhoneLedger } from "./phone-ledger";

type QuickAddDraft = { amount: string; accountId: string | null };
type SavableQuickAddDraft = { amount: string; accountId: string };

function handleCancel() {
  router.back();
}

function handleCreateAccount(next: QuickAddDraft) {
  router.push({
    pathname: "/account/new",
    params: {
      returnTo: "quick-add",
      amount: next.amount,
      ...(next.accountId ? { accountId: next.accountId } : {}),
    },
  });
}

export default function QuickAdd() {
  const raw = useLocalSearchParams<{
    amount?: string | string[];
    accountId?: string | string[];
  }>();
  const draft = parseQuickAddRoute(raw);
  const ledger = requirePhoneLedger();
  const accounts = ledger.getSnapshot().accounts.map((account) => ({
    id: account.id,
    name: account.name,
    currency: "USD" as const,
  }));
  const handleSave = useCallback(
    (next: SavableQuickAddDraft) => {
      ledger.createExpense(next.amount, id<"accounts">(next.accountId));
      router.dismissTo("/");
    },
    [ledger],
  );

  return (
    <GroundPanel>
      {/* No title: the navigation header carries it, and the same
          string twice on one screen reads as two sections. */}
      <Card>
        <QuickAddForm
          accounts={accounts}
          initialAmount={draft.amount}
          {...(draft.accountId ? { initialAccountId: draft.accountId } : {})}
          onCancel={handleCancel}
          onCreateAccount={handleCreateAccount}
          onSave={handleSave}
        />
      </Card>
    </GroundPanel>
  );
}
