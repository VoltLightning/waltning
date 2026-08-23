import { parseNewAccountRoute } from "@waltning/client/ledger/preview-routes";
import { id } from "@waltning/core/id";
import { CreateAccountForm } from "@waltning/ui/accounts/create-account-form";
import { Card, GroundPanel } from "@waltning/ui/shell/card";
import { router, useLocalSearchParams } from "expo-router";
import { useEffect } from "react";
import { requirePhoneLedger } from "./phone-ledger";

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

  if (!target.valid) return null;

  return (
    <GroundPanel>
      <Card title="Create account">
        <CreateAccountForm
          currency="USD"
          onCancel={() => router.back()}
          onSave={(name) => {
            const accountId = id<"accounts">(requirePhoneLedger().createAccount(name));
            if (target.returnTo === "quick-add") {
              router.dismissTo({
                pathname: "/quick-add",
                params: { amount: target.amount, accountId },
              });
            } else {
              router.dismissTo("/");
            }
          }}
        />
      </Card>
    </GroundPanel>
  );
}
