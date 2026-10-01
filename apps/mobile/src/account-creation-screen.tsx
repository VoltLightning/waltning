import { deviceRuntime } from "@waltning/client/ledger/device-runtime";
import { parseNewAccountRoute } from "@waltning/client/ledger/preview-routes";
import { useLedgerController } from "@waltning/client/ledger/use-ledger-controller";
import { usePhoneLedger } from "@waltning/client/ledger/use-phone-ledger";
import { type FieldError, mapFieldErrors } from "@waltning/client/transport/field-errors";
import { addDays } from "@waltning/core/date";
import { errorFromThrown } from "@waltning/core/diagnostics";
import { id } from "@waltning/core/id";
import type { CurrencyCode } from "@waltning/core/money";
import {
  type CreateAccountDraft,
  CreateAccountForm,
  type CreateAccountRateReference,
} from "@waltning/ui/accounts/create-account-form";
import { resolveFieldErrorMessage } from "@waltning/ui/i18n/field-error-messages";
import { useT } from "@waltning/ui/i18n/provider";
import { ErrorState } from "@waltning/ui/states/error-state";
import { router, useLocalSearchParams } from "expo-router";
import { useCallback, useEffect, useState } from "react";
import { PushedPage } from "./pushed-page";

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
  "rate",
];

/** How far back the rate line looks for the last rate a currency held, to pre-fill it. */
const RATE_LOOKBACK_DAYS = 366;

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

  const pivot = snapshot.currencies.find((currency) => currency.isPivot)?.code;

  /**
   * What the form's rate line asks of a currency (S16 §4): `null` when today
   * already has a usable rate, otherwise the last real rate the ledger held —
   * to pre-fill the line — or nothing, for a currency it never held one for.
   * Asked of the replica directly: the question is about one day, so it is a
   * read on demand rather than a field every subscriber recomputes.
   */
  const rateNeed = useCallback(
    (quote: CurrencyCode): { reference: CreateAccountRateReference | null } | null => {
      if (pivot === undefined) return null;
      if (ledger.readRate({ base: pivot, quote, date: today }) !== null) return null;
      let latest: CreateAccountRateReference | null = null;
      for (const row of ledger.listFxRates({
        base: pivot,
        quote,
        from: addDays(today, -RATE_LOOKBACK_DAYS),
        to: today,
      })) {
        if (row.source === "carried_forward") continue;
        if (latest === null || row.date > latest.date) {
          latest = { date: row.date, rate: row.rate, source: row.source };
        }
      }
      return { reference: latest };
    },
    [ledger, pivot, today],
  );

  const handleSave = useCallback(
    (draft: CreateAccountDraft, rate: string | null) => {
      const refuse = (errors: readonly FieldError[], path?: string) => {
        const resolved = errors.map((error) => ({
          path: path ?? error.path,
          message: resolveFieldErrorMessage(t, error),
        }));
        setFieldErrors(mapFieldErrors(resolved, KNOWN_PATHS));
      };
      // The rate first, then the account: a rate written for an account that
      // then refuses is a true statement about the currency, where an account
      // in a currency it cannot value is the state this line exists to avoid.
      // Either refusal leaves the form where it was, with everything typed.
      if (rate !== null && pivot !== undefined) {
        const written = ledger.setManualRate({
          base: pivot,
          quote: draft.currency,
          from: today,
          to: today,
          rate,
          today,
        });
        if ("fieldErrors" in written) {
          refuse(written.fieldErrors, "rate");
          return;
        }
      }
      let result: ReturnType<typeof ledger.createAccount>;
      try {
        result = ledger.createAccount(draft);
      } catch (caught) {
        // An executor refusal that is not a field's (a constraint, say) is
        // stated on the form — never an unhandled throw out of a press, and
        // everything typed stays where it is.
        refuse([{ path: "", message: errorFromThrown(caught).message }]);
        return;
      }
      if (!("id" in result)) {
        refuse(result.fieldErrors);
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
    [ledger, pivot, t, target, today],
  );

  /*
   * **Not `return null`.** A blank cream screen with no name and no way out is
   * the state a reader is least able to leave, and it was reachable here: a
   * row that has gone, or a load that has not landed. The header is the
   * screen's own now, so there is no navigation band to fall back on — the
   * screen draws one or nothing does.
   */
  if (!target.valid) {
    return (
      <PushedPage title={t("routes.createAccount")} subtitle={t("pages.createAccount")}>
        <ErrorState
          variant="terminal"
          what={t("routes.createAccount")}
          why={t("accounts.badReturnTarget")}
        />
      </PushedPage>
    );
  }

  return (
    <PushedPage title={t("routes.createAccount")} subtitle={t("pages.createAccount")}>
      {/* No title: the navigation header carries it, and the same
          string twice on one screen reads as two sections. */}
      <CreateAccountForm
        currencies={snapshot.currencies}
        today={today}
        {...(fieldErrors === undefined ? {} : { fieldErrors })}
        groups={snapshot.groups}
        onCancel={handleCancel}
        onSave={handleSave}
        {...(pivot === undefined ? {} : { pivot })}
        rateNeed={rateNeed}
      />
    </PushedPage>
  );
}
