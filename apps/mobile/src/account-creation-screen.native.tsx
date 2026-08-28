import { parseNewAccountRoute } from "@waltning/client/ledger/preview-routes";
import { id } from "@waltning/core/id";
import { CreateAccountForm } from "@waltning/ui/accounts/create-account-form";
import { Card, GroundPanel } from "@waltning/ui/shell/card";
import { router, useLocalSearchParams } from "expo-router";
import { useCallback, useEffect } from "react";
import { requirePhoneLedger } from "./phone-ledger";

function handleCancel() {
  router.back();
}

export default function NewAccount() {
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
    (name: string) => {
      const accountId = id<"accounts">(requirePhoneLedger().createAccount(name));
      if (target.valid && target.returnTo === "quick-add") {
        router.dismissTo({
          pathname: "/quick-add",
          params: { amount: target.amount, accountId },
        });
      } else {
        router.dismissTo("/");
      }
    },
    [target],
  );

  if (!target.valid) return null;

  return (
    <GroundPanel>
      {/* No title: the navigation header carries it, and the same
          string twice on one screen reads as two sections. */}
      <Card>
        <CreateAccountForm currency="USD" onCancel={handleCancel} onSave={handleSave} />
      </Card>
    </GroundPanel>
  );
}
