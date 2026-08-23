import { parseNewAccountRoute } from "@waltning/client/ledger";
import { id } from "@waltning/core";
import { Card, CreateAccountForm, GroundPanel } from "@waltning/ui";
import { router, useLocalSearchParams } from "expo-router";
import { useEffect } from "react";
import { requirePhoneLedger } from "../../src/phone-ledger";

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
