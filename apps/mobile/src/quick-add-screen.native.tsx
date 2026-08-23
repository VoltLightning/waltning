import { parseQuickAddRoute } from "@waltning/client/ledger/preview-routes";
import { id } from "@waltning/core/id";
import { Card, GroundPanel } from "@waltning/ui/shell/card";
import { QuickAddForm } from "@waltning/ui/transactions/quick-add-form";
import { router, useLocalSearchParams } from "expo-router";
import { requirePhoneLedger } from "./phone-ledger";

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

  return (
    <GroundPanel>
      <Card title="Expense">
        <QuickAddForm
          accounts={accounts}
          initialAmount={draft.amount}
          {...(draft.accountId ? { initialAccountId: draft.accountId } : {})}
          onCancel={() => router.back()}
          onCreateAccount={(next) =>
            router.push({
              pathname: "/account/new",
              params: {
                returnTo: "quick-add",
                amount: next.amount,
                ...(next.accountId ? { accountId: next.accountId } : {}),
              },
            })
          }
          onSave={(next) => {
            ledger.createExpense(next.amount, id<"accounts">(next.accountId));
            router.dismissTo("/");
          }}
        />
      </Card>
    </GroundPanel>
  );
}
