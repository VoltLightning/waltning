import { parseNewAccountRoute } from "@waltning/client/ledger/preview-routes";
import { useLedgerController } from "@waltning/client/ledger/use-ledger-controller";
import { usePhoneLedger } from "@waltning/client/ledger/use-phone-ledger";
import type { FieldError } from "@waltning/client/transport/field-errors";
import { mapFieldErrors } from "@waltning/client/transport/field-errors";
import { id } from "@waltning/core/id";
import {
  type CreateAccountDraft,
  CreateAccountForm,
} from "@waltning/ui/accounts/create-account-form";
import { useT } from "@waltning/ui/i18n/provider";
import { Card, GroundPanel } from "@waltning/ui/shell/card";
import { router, useLocalSearchParams } from "expo-router";
import { useCallback, useEffect, useState } from "react";

function handleCancel() {
  router.back();
}

/** `create_account`'s own field paths — everything else lands at form level. */
const KNOWN_PATHS = [
  "name",
  "currency",
  "kind",
  "ownership",
  "isBusiness",
  "openingBalance",
  "openingDate",
  "memo",
  "groupId",
];

/**
 * A refusal's own text, resolving a known `messageKey` through `useT()` first
 * — the controller cannot call it itself (`packages/client` is not a
 * component). `create_account`'s refusals never carry one today; the switch
 * stays here rather than assuming that never changes.
 */
function resolveFieldErrorMessage(t: ReturnType<typeof useT>, error: FieldError): string {
  if (error.messageKey === "transactions.needsRate") {
    return t("transactions.needsRate", { currency: error.params?.["currency"] ?? "" });
  }
  return error.message;
}

export default function NewAccount() {
  const t = useT();
  const ledger = useLedgerController();
  const snapshot = usePhoneLedger(ledger);
  const [fieldErrors, setFieldErrors] = useState<ReturnType<typeof mapFieldErrors>>();
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
      const result = ledger.createAccount(draft);
      if (!("id" in result)) {
        const resolved = result.fieldErrors.map((error) => ({
          path: error.path,
          message: resolveFieldErrorMessage(t, error),
        }));
        setFieldErrors(mapFieldErrors(resolved, KNOWN_PATHS));
        return;
      }
      setFieldErrors(undefined);
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
    [ledger, t, target],
  );

  if (!target.valid) return null;

  return (
    <GroundPanel>
      {/* No title: the navigation header carries it, and the same
          string twice on one screen reads as two sections. */}
      <Card>
        <CreateAccountForm
          currencies={snapshot.currencies}
          {...(fieldErrors === undefined ? {} : { fieldErrors })}
          groups={snapshot.groups}
          onCancel={handleCancel}
          onSave={handleSave}
        />
      </Card>
    </GroundPanel>
  );
}
