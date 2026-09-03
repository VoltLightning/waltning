import { parseNewAccountRoute } from "@waltning/client/ledger/preview-routes";
import { useLedgerController } from "@waltning/client/ledger/use-ledger-controller";
import { usePhoneLedger } from "@waltning/client/ledger/use-phone-ledger";
import { id } from "@waltning/core/id";
import {
  type CreateAccountDraft,
  CreateAccountForm,
} from "@waltning/ui/accounts/create-account-form";
import { Card, GroundPanel } from "@waltning/ui/shell/card";
import { router, useLocalSearchParams } from "expo-router";
import { useCallback, useEffect } from "react";

function handleCancel() {
  router.back();
}

export default function NewAccount() {
  const ledger = useLedgerController();
  const snapshot = usePhoneLedger(ledger);
  const raw = useLocalSearchParams<{
    returnTo?: string | string[];
    amount?: string | string[];
    accountId?: string | string[];
  }>();
  const target = parseNewAccountRoute(raw);
  const invalidMessage = target.valid ? null : target.message;

  useEffect(() => {
    if (invalidMessage) {
      router.dismissTo({ pathname: "/", params: { message: invalidMessage } });
    }
  }, [invalidMessage]);

  const handleSave = useCallback(
    (draft: CreateAccountDraft) => {
      const result = ledger.createAccount(draft.name, draft.currency);
      // The next commit renders `result.fieldErrors` on the form; this one
      // only stops a refusal from being treated as a save.
      if (!("id" in result)) return;
      const accountId = id<"accounts">(result.id);
      if (target.valid && target.returnTo === "quick-add") {
        router.dismissTo({
          pathname: "/quick-add",
          params: { amount: target.amount, accountId },
        });
      } else {
        router.dismissTo("/");
      }
    },
    [ledger, target],
  );

  if (!target.valid) return null;

  return (
    <GroundPanel>
      {/* No title: the navigation header carries it, and the same
          string twice on one screen reads as two sections. */}
      <Card>
        <CreateAccountForm
          currencies={snapshot.currencies}
          onCancel={handleCancel}
          onSave={handleSave}
        />
      </Card>
    </GroundPanel>
  );
}
