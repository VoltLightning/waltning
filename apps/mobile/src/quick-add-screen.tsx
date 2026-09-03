import type { PhoneCapturableAccount } from "@waltning/client/ledger/create-phone-ledger";
import { parseQuickAddRoute } from "@waltning/client/ledger/preview-routes";
import { useLedgerController } from "@waltning/client/ledger/use-ledger-controller";
import { usePhoneLedger } from "@waltning/client/ledger/use-phone-ledger";
import type { FieldError } from "@waltning/client/transport/field-errors";
import { mapFieldErrors } from "@waltning/client/transport/field-errors";
import { id } from "@waltning/core/id";
import { useT } from "@waltning/ui/i18n/provider";
import { Card, GroundPanel } from "@waltning/ui/shell/card";
import { type QuickAddAccount, QuickAddForm } from "@waltning/ui/transactions/quick-add-form";
import { router, useLocalSearchParams } from "expo-router";
import { useCallback, useState } from "react";

type QuickAddDraft = { amount: string; accountId: string | null };
type SavableQuickAddDraft = { amount: string; accountId: string };

/** `create_transaction`'s own field paths — everything else lands at form level. */
const KNOWN_PATHS = ["amountOriginal", "accountId"];

/**
 * A refusal's own text, resolving the one `messageKey` the controller sets
 * (`transactions.needsRate`, on an uncapturable account) through `useT()` —
 * it cannot call the hook itself (`packages/client` is not a component).
 */
function resolveFieldErrorMessage(t: ReturnType<typeof useT>, error: FieldError): string {
  if (error.messageKey === "transactions.needsRate") {
    return t("transactions.needsRate", { currency: error.params?.["currency"] ?? "" });
  }
  return error.message;
}

function handleCancel() {
  router.back();
}

/**
 * The replica's account onto the form's choice. Named rather than inline —
 * `architecture/11` bans a function expression inside JSX and this is one step
 * from being in it — and it carries the account's own currency, which is what
 * denominates the expense leaving it.
 */
function toChoice(account: PhoneCapturableAccount): QuickAddAccount {
  return {
    id: account.id,
    name: account.name,
    currency: account.currency,
    capturable: account.capturable,
  };
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
  const t = useT();
  const raw = useLocalSearchParams<{
    amount?: string | string[];
    accountId?: string | string[];
  }>();
  const draft = parseQuickAddRoute(raw);
  const ledger = useLedgerController();
  // Subscribed, not a one-shot read: an account created on the sibling route
  // lands in this list the moment the router returns here.
  const snapshot = usePhoneLedger(ledger);
  const accounts = snapshot.accounts.map(toChoice);
  const [fieldErrors, setFieldErrors] = useState<ReturnType<typeof mapFieldErrors>>();
  const handleSave = useCallback(
    (next: SavableQuickAddDraft) => {
      const result = ledger.createExpense(next.amount, id<"accounts">(next.accountId));
      if (!("id" in result)) {
        const resolved = result.fieldErrors.map((error) => ({
          path: error.path,
          message: resolveFieldErrorMessage(t, error),
        }));
        setFieldErrors(mapFieldErrors(resolved, KNOWN_PATHS));
        return;
      }
      setFieldErrors(undefined);
      router.dismissTo("/");
    },
    [ledger, t],
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
          {...(fieldErrors === undefined ? {} : { fieldErrors })}
          onCancel={handleCancel}
          onCreateAccount={handleCreateAccount}
          onSave={handleSave}
        />
      </Card>
    </GroundPanel>
  );
}
