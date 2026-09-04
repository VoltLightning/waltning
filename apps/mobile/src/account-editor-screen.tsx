/**
 * S16 §4, §5, §7 — one account, open to edit, archive, or reconcile.
 *
 * Pushed as `/accounts/[id]`, the same stack-route shape `account/new`
 * already uses. The id names an *active* account: the register never wires
 * a tap on an archived row (`AccountRegister`'s own comment says why), so an
 * id this screen cannot find in the active list is treated as a wiring bug
 * — it renders nothing rather than guessing.
 */

import { deviceRuntime } from "@waltning/client/ledger/device-runtime";
import { useLedgerController } from "@waltning/client/ledger/use-ledger-controller";
import { usePhoneLedger } from "@waltning/client/ledger/use-phone-ledger";
import type { FieldError } from "@waltning/client/transport/field-errors";
import { mapFieldErrors } from "@waltning/client/transport/field-errors";
import { accountingDate, isAccountingDate } from "@waltning/core/date";
import {
  AccountEditor,
  type AccountEditorAccount,
  type AccountPatch,
} from "@waltning/ui/accounts/account-editor";
import { type ReconcileDraft, ReconcileSheet } from "@waltning/ui/accounts/reconcile-sheet";
import { useT } from "@waltning/ui/i18n/provider";
import { Card, GroundPanel } from "@waltning/ui/shell/card";
import { router, useLocalSearchParams } from "expo-router";
import { useCallback, useMemo, useState } from "react";

function handleCancel() {
  router.back();
}

/** `update_account`'s own field paths — everything else (`version`) lands at form level. */
const KNOWN_PATHS = [
  "name",
  "kind",
  "ownership",
  "isBusiness",
  "openingBalance",
  "openingDate",
  "memo",
  "groupId",
];

/**
 * A refusal's own text, resolving a known `messageKey` through `useT()` —
 * `packages/client` is not a component and cannot call it itself. Same shape
 * `account-creation-screen.tsx` uses for `create_account`'s own refusals.
 */
function resolveFieldErrorMessage(t: ReturnType<typeof useT>, error: FieldError): string {
  if (error.messageKey === "accounts.staleVersion") return t("accounts.staleVersion");
  if (error.messageKey === "accounts.sharedNotBusiness") return t("accounts.sharedNotBusiness");
  if (error.messageKey === "accounts.nothingToReconcile") return t("accounts.nothingToReconcile");
  return error.message;
}

export default function AccountEditorScreen() {
  const t = useT();
  const ledger = useLedgerController();
  const snapshot = usePhoneLedger(ledger);
  const { id: rawId } = useLocalSearchParams<{ id: string }>();
  const [fieldErrors, setFieldErrors] = useState<ReturnType<typeof mapFieldErrors>>();
  const [reconcileOpen, setReconcileOpen] = useState(false);
  const [reconcileFieldErrors, setReconcileFieldErrors] = useState<FieldError[]>();
  const today = deviceRuntime().capture().date;
  // S16 §5's live "Computed" figure — refolded through `balanceAsOf` every
  // time this moves, rather than fixed to the balance the sheet opened with.
  const [reconcileAsOf, setReconcileAsOf] = useState<string>(today);

  const account = snapshot.accounts.find((candidate) => candidate.id === rawId);
  const currency = snapshot.currencies.find((candidate) => candidate.code === account?.currency);

  const editorAccount = useMemo((): AccountEditorAccount | null => {
    if (!account) return null;
    return {
      id: account.id,
      name: account.name,
      currency: account.currency,
      currencySymbol: currency?.symbol ?? "",
      kind: account.kind,
      ownership: account.ownership,
      isBusiness: account.isBusiness,
      openingBalance: account.openingBalance,
      openingDate: account.openingDate,
      memo: account.memo,
      groupId: account.groupId,
      version: account.version,
      expectedBalance: account.expectedBalance,
    };
  }, [account, currency]);

  // §2 as of `reconcileAsOf` — refolded live rather than fixed to the
  // account's current balance, which is only ever the same figure by
  // coincidence (reconciling "as of today" with nothing dated after it).
  const reconcileComputedBalance = useMemo(() => {
    if (!account) return null;
    if (!isAccountingDate(reconcileAsOf)) return null;
    return ledger.balanceAsOf(account.id, accountingDate(reconcileAsOf));
  }, [account, ledger, reconcileAsOf]);

  const handleSave = useCallback(
    (patch: AccountPatch) => {
      if (!account) return;
      const result = ledger.updateAccount({ id: account.id, version: account.version, patch });
      if (!("id" in result)) {
        const resolved = result.fieldErrors.map((error) => ({
          path: error.path,
          message: resolveFieldErrorMessage(t, error),
        }));
        setFieldErrors(mapFieldErrors(resolved, KNOWN_PATHS));
        return;
      }
      setFieldErrors(undefined);
      router.back();
    },
    [account, ledger, t],
  );

  const handleArchive = useCallback(() => {
    if (!account) return;
    const result = ledger.archiveAccount({ id: account.id, version: account.version });
    if (!("id" in result)) {
      const resolved = result.fieldErrors.map((error) => ({
        path: error.path,
        message: resolveFieldErrorMessage(t, error),
      }));
      setFieldErrors(mapFieldErrors(resolved, KNOWN_PATHS));
      return;
    }
    router.dismissTo({
      pathname: "/accounts",
      params: { message: t("accounts.archivedToast"), nonce: String(Date.now()) },
    });
  }, [account, ledger, t]);

  const handleOpenReconcile = useCallback(() => {
    setReconcileAsOf(today);
    setReconcileOpen(true);
  }, [today]);
  const handleDismissReconcile = useCallback(() => {
    setReconcileOpen(false);
    setReconcileFieldErrors(undefined);
  }, []);
  const handleSaveReconcile = useCallback(
    (draft: ReconcileDraft) => {
      if (!account) return;
      const result = ledger.reconcileAccount({
        accountId: account.id,
        observedBalance: draft.observedBalance,
        asOf: draft.asOf,
        note: draft.note,
        categoryId: null,
      });
      if (!("id" in result)) {
        setReconcileFieldErrors(
          result.fieldErrors.map((error) => ({
            path: error.path,
            message: resolveFieldErrorMessage(t, error),
          })),
        );
        return;
      }
      setReconcileFieldErrors(undefined);
      setReconcileOpen(false);
    },
    [account, ledger, t],
  );
  const handleCreateGroup = useCallback(
    (name: string): string | null => {
      const result = ledger.createGroup({ name, institution: null });
      return "id" in result ? result.id : null;
    },
    [ledger],
  );

  if (!editorAccount || !account) return null;

  return (
    <GroundPanel>
      <Card>
        <AccountEditor
          account={editorAccount}
          today={today}
          groups={snapshot.groups}
          {...(fieldErrors === undefined ? {} : { fieldErrors })}
          onCancel={handleCancel}
          onSave={handleSave}
          onArchive={handleArchive}
          onReconcile={handleOpenReconcile}
          onCreateGroup={handleCreateGroup}
        />
      </Card>
      <ReconcileSheet
        visible={reconcileOpen}
        accountName={account.name}
        currency={account.currency}
        decimals={account.decimals}
        computedBalance={reconcileComputedBalance ?? account.balance}
        asOf={reconcileAsOf}
        onAsOfChange={setReconcileAsOf}
        today={today}
        {...(reconcileFieldErrors === undefined
          ? {}
          : { fieldErrors: mapFieldErrors(reconcileFieldErrors, ["observedBalance"]) })}
        onDismiss={handleDismissReconcile}
        onSave={handleSaveReconcile}
      />
    </GroundPanel>
  );
}
