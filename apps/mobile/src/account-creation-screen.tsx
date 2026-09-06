import { deviceRuntime } from "@waltning/client/ledger/device-runtime";
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
import { GroundPanel } from "@waltning/ui/shell/card";
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
  /** M1 — `openingBalance`'s own scale mirror (`create-phone-ledger.ts`). */
  if (error.messageKey === "transactions.tooManyDecimals") {
    return t("transactions.tooManyDecimals", {
      currency: error.params?.["currency"] ?? "",
      decimals: error.params?.["decimals"] ?? "",
    });
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
  // The device's own calendar (§7.0a) — `DateField`'s shortcut row. Same call
  // `quick-add-screen.tsx` makes; `deviceRuntime` reads `Intl`/`Date` only,
  // never a platform API.
  const today = deviceRuntime().capture().date;

  useEffect(() => {
    if (invalidMessage) {
      router.dismissTo({ pathname: "/", params: { message: invalidMessage } });
    }
  }, [invalidMessage]);

  /**
   * §14.6's way out, from the form's own note: S18, opened on the currency
   * that has no rate and on the day the form is already dated by. `today` is
   * the same bare `YYYY-MM-DD` string `DateField`'s shortcut row uses — no
   * `Date` arithmetic, and no second source for what day it is.
   */
  const handleSetRate = useCallback(
    (currency: string) => {
      router.push({ pathname: "/settings/rates", params: { quote: currency, date: today } });
    },
    [today],
  );

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
      } else if (target.valid && target.returnTo === "accounts") {
        router.dismissTo("/accounts");
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
      <CreateAccountForm
        currencies={snapshot.currencies}
        today={today}
        {...(fieldErrors === undefined ? {} : { fieldErrors })}
        groups={snapshot.groups}
        onCancel={handleCancel}
        onSave={handleSave}
        onSetRate={handleSetRate}
      />
    </GroundPanel>
  );
}
