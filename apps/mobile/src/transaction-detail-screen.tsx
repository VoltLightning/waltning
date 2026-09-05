/**
 * S09 · Transaction detail — `screens/S09-transaction-detail.md`.
 *
 * **`FxAmount`'s full basis, the receipt card and the audit history are not
 * built.** `wave-3-shared.md` names all three unbuilt this wave — no rate
 * table (`#e3`), no receipts, no audit log on the phone — so the layout
 * leaves no gap for them, per the plan.
 *
 * **Deletion has no undo, on the phone, today.** `operations.md` calls
 * deletion "the one thing you cannot un-notice" and the mock shows an
 * `UndoToast`; there is no `restore_transaction` operation in
 * `operations.md` for it to call, so this is a plain `Toast` instead. The
 * follow-up card this PR names: *restore ops for delete/archive*.
 *
 * **Counterparty and `is_capital` are not offered.** `#e3` has no
 * counterparty write path yet, and nothing in this wave drives `is_capital`
 * (§6.8) — both would be a control that writes into a void. `FieldsCard`'s
 * own doc says the same; repeated here because it is this screen's decision
 * to make, not only the component's.
 *
 * **A read, not snapshot state.** `controller.getTransaction(id)` is called
 * once on mount and again after every successful write — there is no
 * subscription for one row, so a save that changes nothing this screen
 * shows (an unrelated write elsewhere) never triggers an extra read.
 */

import type {
  PhoneCapturableAccount,
  PhoneTransactionDetail,
} from "@waltning/client/ledger/create-phone-ledger";
import { deviceRuntime } from "@waltning/client/ledger/device-runtime";
import { parseTransactionRoute } from "@waltning/client/ledger/preview-routes";
import { useLedgerController } from "@waltning/client/ledger/use-ledger-controller";
import { usePhoneLedger } from "@waltning/client/ledger/use-phone-ledger";
import type { FieldError } from "@waltning/client/transport/field-errors";
import { mapFieldErrors } from "@waltning/client/transport/field-errors";
import { id as brandId } from "@waltning/core/id";
import * as money from "@waltning/core/money";
import { AccountPicker, type AccountPickerAccount } from "@waltning/ui/accounts/account-picker";
import {
  CategorySheet,
  type CategorySheetCreateDraft,
} from "@waltning/ui/categories/category-sheet";
import { useT } from "@waltning/ui/i18n/provider";
import { Button } from "@waltning/ui/primitives/button";
import { Card, GroundPanel } from "@waltning/ui/shell/card";
import { ErrorState } from "@waltning/ui/states/error-state";
import {
  FieldsCard,
  type TransactionFields,
  type TransactionFieldsPatch,
} from "@waltning/ui/transactions/fields-card";
import { LinesCard, type LinesCardDraftLine } from "@waltning/ui/transactions/lines-card";
import { TransactionHero } from "@waltning/ui/transactions/transaction-hero";
import { router, useLocalSearchParams } from "expo-router";
import { useCallback, useMemo, useState } from "react";

/** Resolves the one `messageKey` a refusal here ever carries. */
function resolveFieldErrorMessage(t: ReturnType<typeof useT>, error: FieldError): string {
  if (error.messageKey === "transactions.changedElsewhere") {
    return t("transactions.changedElsewhere");
  }
  return error.message;
}

/**
 * Every refusal this screen sees is form-level — `refusalFromThrow` in
 * `create-phone-ledger.ts` never names a field, so an empty known-paths list
 * is exactly right here: `mapFieldErrors` puts everything in `formLevel`
 * by construction, the same function `quick-add-screen.tsx` calls for its
 * own known paths.
 */
function toFormLevel(t: ReturnType<typeof useT>, errors: readonly FieldError[]) {
  return mapFieldErrors(
    errors.map((error) => ({ path: error.path, message: resolveFieldErrorMessage(t, error) })),
    [],
  );
}

function toFields(detail: PhoneTransactionDetail): TransactionFields {
  return {
    date: detail.date,
    accountId: detail.accountId,
    categoryId: detail.categoryId,
    payee: detail.payee,
    note: detail.note,
    isBusiness: detail.isBusiness,
  };
}

/**
 * The replica's account onto `AccountPicker`'s own choice shape — grouped,
 * kind-ordered, S16 §3. `FieldsCard`'s own `accounts` prop is widened to the
 * same shape (`fields-card.tsx`'s own doc), so this one mapping answers both
 * the card's "what is the current pick called" lookup and the sheet itself —
 * no second, narrower mapper only for the card.
 */
function toPickerChoice(account: PhoneCapturableAccount): AccountPickerAccount {
  return {
    id: account.id,
    name: account.name,
    currency: account.currency,
    decimals: account.decimals,
    kind: account.kind,
    capturable: account.capturable,
    ownership: account.ownership,
    groupId: account.groupId,
    archived: account.archived,
  };
}

/**
 * The escape to account creation — unlike `quick-add-screen.tsx`'s, this
 * screen has no restorable route shape for the transaction being edited
 * (`parseNewAccountRoute` only carries `quick-add`'s own amount/account
 * pair), so creating an account mid-edit lands on the accounts list rather
 * than resuming this draft — the same gap `transfer-screen.tsx`'s own escape
 * names.
 */
function handleCreateAccountFromDetail() {
  router.push({ pathname: "/account/new", params: { returnTo: "accounts" } });
}

function handleBack() {
  router.back();
}

export default function TransactionDetail() {
  const t = useT();
  const ledger = useLedgerController();
  // Subscribed — an account renamed or a category created elsewhere while
  // this screen is open still shows up the moment either picker opens.
  const snapshot = usePhoneLedger(ledger);
  const raw = useLocalSearchParams<{ id?: string | string[] }>();
  const rawId = parseTransactionRoute(raw);
  const transactionId = rawId ? brandId<"transactions">(rawId) : null;

  const [detail, setDetail] = useState<PhoneTransactionDetail | null>(() =>
    transactionId ? ledger.getTransaction(transactionId) : null,
  );
  const [fieldsErrors, setFieldsErrors] = useState<ReturnType<typeof mapFieldErrors>>();
  const [linesErrors, setLinesErrors] = useState<ReturnType<typeof mapFieldErrors>>();
  const [categorySheetOpen, setCategorySheetOpen] = useState(false);
  /**
   * `AccountPicker` (`accounts/`) is a sibling domain — the same rule
   * `CategorySheet` already keeps. `null` until a pick is made; `FieldsCard`
   * reads `detail.accountId` until then (`effectiveAccountId`, below).
   */
  const [pickedAccountId, setPickedAccountId] = useState<string | null>(null);
  const [accountPickerOpen, setAccountPickerOpen] = useState(false);

  const refetch = useCallback(() => {
    if (!transactionId) return;
    setDetail(ledger.getTransaction(transactionId));
  }, [ledger, transactionId]);

  const handleOpenCategoryPicker = useCallback(() => setCategorySheetOpen(true), []);
  const handleDismissCategorySheet = useCallback(() => setCategorySheetOpen(false), []);
  const handleOpenAccountPicker = useCallback(() => setAccountPickerOpen(true), []);
  const handleDismissAccountPicker = useCallback(() => setAccountPickerOpen(false), []);
  const handlePickAccount = useCallback((next: string) => {
    setPickedAccountId(next);
    setAccountPickerOpen(false);
  }, []);

  const handlePickCategory = useCallback(
    (categoryId: string) => {
      if (!transactionId || !detail) return;
      const result = ledger.updateTransaction(transactionId, detail.version, { categoryId });
      setCategorySheetOpen(false);
      if ("id" in result) {
        setFieldsErrors(undefined);
        refetch();
        return;
      }
      setFieldsErrors(toFormLevel(t, result.fieldErrors));
    },
    [detail, ledger, refetch, t, transactionId],
  );

  const handleCreateCategory = useCallback(
    (draft: CategorySheetCreateDraft) => {
      const result = ledger.createCategory(draft);
      if ("id" in result) return { id: result.id };
      return { error: result.fieldErrors[0]?.message ?? t("common.couldNotSave") };
    },
    [ledger, t],
  );

  const handleSaveFields = useCallback(
    (patch: TransactionFieldsPatch) => {
      if (!transactionId || !detail) return;
      const result = ledger.updateTransaction(transactionId, detail.version, patch);
      if ("id" in result) {
        setFieldsErrors(undefined);
        refetch();
        return;
      }
      setFieldsErrors(toFormLevel(t, result.fieldErrors));
    },
    [detail, ledger, refetch, t, transactionId],
  );

  const handleSaveLines = useCallback(
    (lines: readonly LinesCardDraftLine[]) => {
      if (!transactionId || !detail) return;
      const result = ledger.setTransactionLines(transactionId, detail.version, lines);
      if ("id" in result) {
        setLinesErrors(undefined);
        refetch();
        return;
      }
      setLinesErrors(toFormLevel(t, result.fieldErrors));
    },
    [detail, ledger, refetch, t, transactionId],
  );

  const handleDelete = useCallback(() => {
    if (!transactionId || !detail) return;
    const result = ledger.deleteTransaction(transactionId, detail.version);
    if ("id" in result) {
      // No undo: `operations.md` names deletion "the one thing you cannot
      // un-notice", the mock's `UndoToast` has no `restore_transaction` to
      // call, so this is the plain `Toast` — the same route param
      // `account-creation-screen.tsx` already uses to carry one to Today.
      router.dismissTo({
        pathname: "/",
        params: { message: t("transactions.deleted"), nonce: String(Date.now()) },
      });
      return;
    }
    setFieldsErrors(toFormLevel(t, result.fieldErrors));
  }, [detail, ledger, t, transactionId]);

  const today = useMemo(() => deviceRuntime().capture().date, []);
  const categoryKind = detail?.type === "income" ? "income" : "expense";
  // Same-currency only: reassigning across a currency boundary would also
  // change the amount's valuation, which needs a rate this wave does not
  // have (`#e3`) — the picker simply does not offer that account.
  const sameCurrencyAccounts = useMemo(
    () =>
      detail ? snapshot.accounts.filter((account) => account.currency === detail.currency) : [],
    [detail, snapshot.accounts],
  );
  const pickerAccounts = useMemo(
    () => sameCurrencyAccounts.map(toPickerChoice),
    [sameCurrencyAccounts],
  );
  const pickerGroups = useMemo(
    () => snapshot.groups.map((group) => ({ id: group.id, name: group.name })),
    [snapshot.groups],
  );

  if (!detail) {
    return (
      <GroundPanel>
        <ErrorState
          variant="terminal"
          what={t("routes.transaction")}
          why={t("transactions.notFound")}
          action={{ label: t("common.back"), onPress: handleBack }}
        />
      </GroundPanel>
    );
  }

  const effectiveAccountId = pickedAccountId ?? detail.accountId;

  return (
    <GroundPanel>
      <TransactionHero
        amount={detail.amount}
        currency={detail.currency}
        decimals={detail.decimals}
        type={detail.type}
        accountName={detail.accountName}
        payee={detail.payee}
        brandKey={detail.brandKey}
      />
      <Card>
        <FieldsCard
          fields={toFields(detail)}
          accounts={pickerAccounts}
          accountId={effectiveAccountId}
          onOpenAccountPicker={handleOpenAccountPicker}
          today={today}
          categoryId={detail.categoryId}
          categoryName={detail.categoryName}
          onOpenCategoryPicker={handleOpenCategoryPicker}
          {...(fieldsErrors ? { fieldErrors: fieldsErrors } : {})}
          onSave={handleSaveFields}
        />
      </Card>
      <Card title={t("transactions.lines")}>
        <LinesCard
          lines={detail.lines}
          total={money.abs(detail.amount)}
          currency={detail.currency}
          decimals={detail.decimals}
          {...(linesErrors ? { fieldErrors: linesErrors } : {})}
          onSave={handleSaveLines}
        />
      </Card>
      <Button label={t("transactions.delete")} onPress={handleDelete} variant="danger" />
      <CategorySheet
        visible={categorySheetOpen}
        kind={categoryKind}
        tree={snapshot.categoryTree}
        onPick={handlePickCategory}
        onCreate={handleCreateCategory}
        onDismiss={handleDismissCategorySheet}
      />
      <AccountPicker
        visible={accountPickerOpen}
        accounts={pickerAccounts}
        groups={pickerGroups}
        accountId={effectiveAccountId}
        onPick={handlePickAccount}
        onCreateAccount={handleCreateAccountFromDetail}
        onDismiss={handleDismissAccountPicker}
      />
    </GroundPanel>
  );
}
