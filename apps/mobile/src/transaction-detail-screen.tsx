/**
 * S09 · Transaction detail — `screens/S09-transaction-detail.md`.
 *
 * **`FxAmount`'s full basis, the receipt card and the audit history are not
 * built.** `wave-3-shared.md` names all three unbuilt this wave — no rate
 * table (`#e3`), no receipts, and no `AuditHistory`
 * (`design-system/05-composites.md`) — so the layout leaves no gap for them,
 * per the plan.
 *
 * **The audit section is not merely deferred.** `audit_log` is not a
 * replicated table (`architecture/14-local-first.md`), so the phone's own
 * `get_audit_log` answers `unavailable_on_device` rather than rows. When
 * `AuditHistory` lands here it renders *not available on this device* — S09
 * §6's Offline row — never an empty list standing in for "nothing ever
 * changed this row".
 *
 * **Deletion has no undo, on the phone, today.** `operations.md` calls
 * deletion "the one thing you cannot un-notice" and the mock shows an
 * `UndoToast`; there is no `restore_transaction` operation in
 * `operations.md` for it to call, so this is a plain `Toast` instead. The
 * follow-up card this PR names: *restore ops for delete/archive*.
 *
 * **Counterparty and `is_capital` are offered here and nowhere else.**
 * `update_transaction`'s patch has always carried both and `readTransaction`
 * now reads them back, so the two rows S09 §3 draws are controls that write.
 * §6.8 is explicit that the one-off flag belongs *here* rather than on the
 * capture sheet: you rarely know at the till that a purchase would distort a
 * trend, and marking it later never moves a balance.
 *
 * **Two reads of one row.** The draft's base — mount and this screen's own
 * writes, whose `version` every save sends — and the live row, re-read with
 * each ledger revision for the header and the context cards (see `live`).
 */

import { settleResidualDirection } from "@waltning/client/counterparties/counterparty-figures";
import { debtIntentOf } from "@waltning/client/counterparties/debt-intent";
import { planRepayment } from "@waltning/client/counterparties/repayment-plan";
import type {
  PhoneCapturableAccount,
  PhoneTransactionDetail,
} from "@waltning/client/ledger/create-phone-ledger";
import { deviceRuntime } from "@waltning/client/ledger/device-runtime";
import { parseTransactionRoute } from "@waltning/client/ledger/preview-routes";
import type { TransactionContextCard } from "@waltning/client/ledger/transaction-context";
import { useLedgerController } from "@waltning/client/ledger/use-ledger-controller";
import { usePhoneLedger } from "@waltning/client/ledger/use-phone-ledger";
import { useTransactionContext } from "@waltning/client/ledger/use-transaction-context";
import type { FieldError } from "@waltning/client/transport/field-errors";
import { mapFieldErrors } from "@waltning/client/transport/field-errors";
import { accountingDate } from "@waltning/core/date";
import { id as brandId } from "@waltning/core/id";
import * as money from "@waltning/core/money";
import { AccountPicker, type AccountPickerAccount } from "@waltning/ui/accounts/account-picker";
import {
  CategorySheet,
  type CategorySheetCreateDraft,
} from "@waltning/ui/categories/category-sheet";
import { CounterpartyPicker } from "@waltning/ui/counterparties/counterparty-picker";
import { categoryTintKey, drawnNamesOf } from "@waltning/ui/i18n/category-label";
import { resolveFieldErrorMessage } from "@waltning/ui/i18n/field-error-messages";
import { dayLabel, decimalMark } from "@waltning/ui/i18n/locales";
import { useLocale, useT } from "@waltning/ui/i18n/provider";
import { useCategoryLabel } from "@waltning/ui/i18n/use-category-label";
import { Button } from "@waltning/ui/primitives/button";
import { useBreakpoint } from "@waltning/ui/primitives/use-breakpoint";
import { ErrorState } from "@waltning/ui/states/error-state";
import { useTheme } from "@waltning/ui/theme/provider";
import { makeStyles } from "@waltning/ui/theme/styles";
import { space } from "@waltning/ui/tokens";
import { ContextStrip, type ContextStripCard } from "@waltning/ui/transactions/context-strip";
import {
  FieldsCard,
  type TransactionFields,
  type TransactionFieldsPatch,
} from "@waltning/ui/transactions/fields-card";
import { HeroHeaderTitle } from "@waltning/ui/transactions/hero-header-title";
import { LinesCard, type LinesCardDraftLine } from "@waltning/ui/transactions/lines-card";
import { heroTint, TransactionHero } from "@waltning/ui/transactions/transaction-hero";
import { useHeroScroll } from "@waltning/ui/transactions/use-hero-scroll";
import { router, useLocalSearchParams } from "expo-router";
import { useCallback, useMemo, useState } from "react";
import { View } from "react-native";
import { PushedPage } from "./pushed-page";

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

/** `toDecimals` is the destination account's scale — a transfer's second leg is in its own currency. */
function toFields(detail: PhoneTransactionDetail, toDecimals: number): TransactionFields {
  return {
    type: detail.type,
    date: detail.date,
    accountId: detail.accountId,
    // As stored: unsigned on every type but an adjustment, whose sign is its own.
    amount: money.round(
      detail.type === "adjustment" ? detail.amount : money.abs(detail.amount),
      detail.decimals,
    ),
    toAccountId: detail.toAccountId,
    toAmount: detail.toAmount === null ? null : money.round(detail.toAmount, toDecimals),
    fee: detail.fee === null ? null : money.round(detail.fee, detail.decimals),
    categoryId: detail.categoryId,
    counterpartyId: detail.counterpartyId,
    obligationCounterpartyId: detail.obligationCounterpartyId,
    obligationRole: detail.obligationRole,
    enteredName: detail.enteredName,
    note: detail.note,
    isBusiness: detail.isBusiness,
    isCapital: detail.isCapital,
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

/**
 * The context figures onto `ContextStrip`'s cards — names from the directory
 * and the account list, and the two ways out a card offers. Figures pass
 * through untouched; `computations.md` §6a is `useTransactionContext`'s.
 */
function toStripCards(
  context: readonly TransactionContextCard[],
  names: {
    counterparty: string | null;
    fromAccount: string;
    toAccount: string | null;
    categoryName: (id: string) => { name: string; tintKey: string } | null;
  },
  actions: { onOpenCounterparty: () => void; onLink: () => void; counterpartyUnsaved: boolean },
): ContextStripCard[] {
  const cards: ContextStripCard[] = [];
  for (const card of context) {
    switch (card.kind) {
      case "who":
        cards.push({
          ...card,
          name: names.counterparty ?? "—",
          onOpenAll: actions.onOpenCounterparty,
          onChange: actions.onLink,
          unsaved: actions.counterpartyUnsaved,
        });
        break;
      case "pair":
        cards.push({
          ...card,
          fromName: names.fromAccount,
          toName: names.toAccount ?? "—",
        });
        break;
      case "category": {
        const named = names.categoryName(card.categoryId);
        if (named === null) break;
        cards.push({ ...card, name: named.name, tintKey: named.tintKey });
        break;
      }
      case "link":
        cards.push({ kind: "link", onLink: actions.onLink });
        break;
    }
  }
  return cards;
}

export default function TransactionDetail() {
  const t = useT();
  const labelOf = useCategoryLabel();
  const styles = useStyles();
  const locale = useLocale();
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
  /** A transfer's destination, picked the same way — one sheet, two legs. */
  const [pickedToAccountId, setPickedToAccountId] = useState<string | null>(null);
  /** Which leg the one `AccountPicker` is answering for; `null` is closed. */
  const [accountPickerFor, setAccountPickerFor] = useState<"from" | "to" | null>(null);
  /** The same rule again: `counterparties/` is a sibling domain, so its picker is composed here. */
  const [pickedCounterparty, setPickedCounterparty] = useState<{
    identity?: { id: string; name: string };
    obligation?: { id: string; name: string };
  }>({});
  /**
   * **Which link the one picker is answering for.** S09 is the surface where
   * the two can differ (§6.6.1) — paying a shop for a friend names the shop
   * on one row and the friend on the other — and `null` is "closed", so the
   * sheet's own visibility and its target are one piece of state rather than
   * two that can disagree.
   */
  const [pickerTarget, setPickerTarget] = useState<"identity" | "obligation" | null>(null);

  const refetch = useCallback(() => {
    if (!transactionId) return;
    setDetail(ledger.getTransaction(transactionId));
  }, [ledger, transactionId]);
  /*
    **Two reads of one row, for two jobs.** `detail` is the row the draft was
    started from: read on mount and after this screen's own writes, and its
    `version` is what a save sends — so a write from elsewhere while the draft
    is open is refused as a conflict rather than silently overwritten by a
    draft that never saw it. `live` is the row as the ledger holds it now,
    read in the same render as the context cards so the share and the totals
    are always one moment; the header and the cards draw from it.
  */
  // biome-ignore lint/correctness/useExhaustiveDependencies: the revision is the signal, not a value read.
  const live = useMemo(
    () => (transactionId ? ledger.getTransaction(transactionId) : null),
    [ledger, transactionId, snapshot.revision],
  );

  const handleOpenCategoryPicker = useCallback(() => setCategorySheetOpen(true), []);
  const handleDismissCategorySheet = useCallback(() => setCategorySheetOpen(false), []);
  const handleOpenAccountPicker = useCallback(() => setAccountPickerFor("from"), []);
  const handleOpenToAccountPicker = useCallback(() => setAccountPickerFor("to"), []);
  const handleDismissAccountPicker = useCallback(() => setAccountPickerFor(null), []);
  const handlePickAccount = useCallback(
    (next: string) => {
      if (accountPickerFor === "to") setPickedToAccountId(next);
      else setPickedAccountId(next);
      setAccountPickerFor(null);
    },
    [accountPickerFor],
  );

  const handleOpenCounterpartyPicker = useCallback(
    (target: "identity" | "obligation") => setPickerTarget(target),
    [],
  );
  const handleDismissCounterpartyPicker = useCallback(() => setPickerTarget(null), []);
  const handlePickCounterparty = useCallback(
    (next: string) => {
      const picked = snapshot.counterparties.find((row) => row.id === next);
      if (picked !== undefined && pickerTarget !== null) {
        setPickedCounterparty((current) => ({
          ...current,
          [pickerTarget]: { id: picked.id, name: picked.name },
        }));
      }
      setPickerTarget(null);
    },
    [pickerTarget, snapshot.counterparties],
  );
  const handleCreateCounterparty = useCallback(() => {
    setPickerTarget(null);
    router.push({ pathname: "/counterparty/new", params: { returnTo: "transaction" } });
  }, []);

  /**
   * §6.6 — a category pick that touches a debt category (into one, or out of
   * one) is **held in the card until Save**, because the role and the person
   * it asks for go with it: writing the category alone would leave a `debt`
   * under *Salary*, or a *Borrowed* with nobody on the other side. Any other
   * pick is written straight away, as it always was.
   */
  const [pickedCategoryId, setPickedCategoryId] = useState<string | null>(null);
  const debtIntentOfCategory = useCallback(
    (categoryId: string | null) =>
      debtIntentOf(snapshot.categories.find((category) => category.id === categoryId)?.externalId),
    [snapshot.categories],
  );
  const handlePickCategory = useCallback(
    (categoryId: string) => {
      if (!transactionId || !detail) return;
      if (debtIntentOfCategory(categoryId) !== null || debtIntentOfCategory(detail.categoryId)) {
        setPickedCategoryId(categoryId === detail.categoryId ? null : categoryId);
        setCategorySheetOpen(false);
        return;
      }
      const result = ledger.updateTransaction(transactionId, detail.version, { categoryId });
      setCategorySheetOpen(false);
      if ("id" in result) {
        setFieldsErrors(undefined);
        refetch();
        return;
      }
      setFieldsErrors(toFormLevel(t, result.fieldErrors));
    },
    [debtIntentOfCategory, detail, ledger, refetch, t, transactionId],
  );

  const handleCreateCategory = useCallback(
    (draft: CategorySheetCreateDraft) => {
      const result = ledger.createCategory({
        ...draft,
        drawnNames: drawnNamesOf(labelOf, snapshot.categoryTree),
      });
      if ("id" in result) return { id: result.id };
      return { error: result.fieldErrors[0]?.message ?? t("common.couldNotSave") };
    },
    [ledger, t, labelOf, snapshot.categoryTree],
  );

  const handleSaveFields = useCallback(
    (patch: TransactionFieldsPatch) => {
      if (!transactionId || !detail) return;
      /**
       * **A repayment is `settle_debt`, here as in Quick add** (S14): a row
       * picked into *Repayment received* / *Repayment made* is not patched into
       * it — `update_transaction` refuses that, because a plain patch would
       * carry the debt role without the discharge, the direction check or
       * "nothing to settle". The row's own figures settle the person's open debt
       * in the matching direction, and the settlement replaces the original in
       * the same write (`supersedes`) — never a settle followed by a delete.
       */
      const intoCategory = snapshot.categories.find((category) => category.id === patch.categoryId);
      const repaymentIntent = debtIntentOf(intoCategory?.externalId);
      if (repaymentIntent?.settles && patch.categoryId) {
        const person = patch.obligationCounterpartyId ?? detail.obligationCounterpartyId;
        if (person === null || person === undefined) return;
        const amount = patch.amountOriginal ?? money.abs(detail.amount);
        const accountId = patch.accountId ?? detail.accountId;
        const account = snapshot.accounts.find((candidate) => candidate.id === accountId);
        const date = patch.date ?? detail.date;
        if (account === undefined) return;
        const plan = planRepayment({
          intent: repaymentIntent,
          balances: ledger
            // Without the row being replaced: it is not part of the debt it settles.
            .listCounterpartyBalances(deviceRuntime().capture().date, { excluding: transactionId })
            .filter((row) => row.counterpartyId === person),
          accountCurrency: account.currency,
          amount,
          crossRate: (from) =>
            ledger.readCrossRate({ from, to: account.currency, date: accountingDate(date) })
              ?.rate ?? null,
        });
        const name = snapshot.counterparties.find((row) => row.id === person)?.name ?? "";
        if (plan?.kind === "no-debt" || plan?.kind === "no-rate") {
          setFieldsErrors(
            mapFieldErrors(
              [
                {
                  path: "",
                  message:
                    plan.kind === "no-debt"
                      ? t("transactions.nothingToSettle", { name })
                      : t("transactions.settleNeedsRate", { currency: plan.currency }),
                },
              ],
              [],
            ),
          );
          return;
        }
        if (plan?.kind === "settle") {
          const settled = ledger.settleDebt({
            counterpartyId: person,
            accountId,
            date,
            amount,
            currency: account.currency,
            dischargesCurrency: plan.currency,
            dischargesAmount: plan.dischargesAmount,
            note: patch.note ?? detail.note,
            categoryId: patch.categoryId,
            // One operation: the settlement replaces this row in the same write.
            supersedes: { id: transactionId, version: detail.version },
          });
          if (!("id" in settled)) {
            setFieldsErrors(toFormLevel(t, settled.fieldErrors));
            return;
          }
          router.dismissTo({
            pathname: "/",
            params: {
              message: t("counterparties.settledToast", {
                amount: money.forDisplay(
                  money.abs(settled.residual),
                  plan.decimals,
                  decimalMark(locale),
                ),
                currency: plan.currency,
                direction: t(
                  `counterparties.${settleResidualDirection(settled.residual, plan.decimals)}`,
                ),
              }),
              nonce: String(Date.now()),
            },
          });
          return;
        }
      }
      const result = ledger.updateTransaction(transactionId, detail.version, patch);
      if ("id" in result) {
        setFieldsErrors(undefined);
        setPickedCategoryId(null);
        refetch();
        return;
      }
      setFieldsErrors(toFormLevel(t, result.fieldErrors));
    },
    [
      detail,
      ledger,
      locale,
      refetch,
      snapshot.accounts,
      snapshot.categories,
      snapshot.counterparties,
      t,
      transactionId,
    ],
  );

  /**
   * **A re-allocation, never a restatement — `LinesCard` cannot express one.**
   * Its `Save` is disabled unless the draft sums to the total it was handed,
   * so every set that reaches here already matches and there is no new amount
   * to carry. The controller's fourth parameter exists for the restatement
   * (§10.3's invariant runs both ways, and each operation on the device is its
   * own transaction), and S06 will pass it the day the card grows an explicit
   * "the total was N" affordance. Deriving it from the lines instead would
   * rewrite a transaction's amount whenever a user mistyped one.
   */
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

  const theme = useTheme();
  const phone = useBreakpoint() === "phone";
  const heroScroll = useHeroScroll();
  /*
    **The card follows the pick, not only the saved row.** A counterparty picked
    here is a draft until `Save` (§6.6.1 — cancelling restores it), so the
    saved row alone kept offering "Who was this with?" after a choice. The
    context is read for the row as it would be saved.
  */
  const pickedIdentity = pickedCounterparty.identity;
  const subject = useMemo(
    () =>
      live !== null && pickedIdentity !== undefined
        ? { ...live, counterpartyId: pickedIdentity.id as typeof live.counterpartyId }
        : live,
    [live, pickedIdentity],
  );
  const context = useTransactionContext(ledger, subject, snapshot.revision);
  const shownCounterpartyId = pickedIdentity?.id ?? detail?.counterpartyId ?? null;
  const handleOpenCounterparty = useCallback(() => {
    if (shownCounterpartyId) router.push(`/counterparty/${shownCounterpartyId}`);
  }, [shownCounterpartyId]);
  const handleLinkCounterparty = useCallback(() => setPickerTarget("identity"), []);
  const stripCards = useMemo(
    () =>
      live === null
        ? []
        : toStripCards(
            context,
            {
              // Read with the row, so an archived counterparty or a closed
              // destination account keeps its name (the snapshot lists omit both).
              counterparty: pickedIdentity?.name ?? live.counterpartyIdentityName,
              fromAccount: live.accountName,
              toAccount: live.toAccountName,
              categoryName: (id) => {
                const named =
                  id === live.categoryId ? live : live.lines.find((line) => line.categoryId === id);
                if (named?.categoryName == null) return null;
                const row = { name: named.categoryName, externalId: named.categoryExternalId };
                return { name: labelOf(row), tintKey: categoryTintKey(row) };
              },
            },
            {
              onOpenCounterparty: handleOpenCounterparty,
              onLink: handleLinkCounterparty,
              counterpartyUnsaved:
                pickedIdentity !== undefined && pickedIdentity.id !== live.counterpartyId,
            },
          ),
    [context, live, pickedIdentity, handleLinkCounterparty, handleOpenCounterparty, labelOf],
  );

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
      <PushedPage title={t("routes.transaction")} subtitle={t("pages.transaction")}>
        {/*
          No action. The page header above this carries the way back now, and
          two controls labelled *Back* on one screen is one of them being
          read aloud twice and neither being the obvious one.
        */}
        <ErrorState
          variant="terminal"
          what={t("routes.transaction")}
          why={t("transactions.notFound")}
        />
      </PushedPage>
    );
  }

  // The header draws the row as it is now; the fields draw the draft's base.
  const shown = live ?? detail;
  const shownCategory =
    shown.categoryName === null
      ? null
      : labelOf({ name: shown.categoryName, externalId: shown.categoryExternalId });
  const shownTintKey =
    shown.categoryName === null
      ? null
      : categoryTintKey({ name: shown.categoryName, externalId: shown.categoryExternalId });
  const detailCategory =
    detail.categoryName === null
      ? null
      : labelOf({ name: detail.categoryName, externalId: detail.categoryExternalId });
  const effectiveAccountId = pickedAccountId ?? detail.accountId;
  const effectiveToAccountId = pickedToAccountId ?? detail.toAccountId;
  // The pick until it is saved, the saved row afterwards — `accountId`'s own rule.
  const effectiveCategoryId = pickedCategoryId ?? detail.categoryId;
  // A held pick is drawn like any other category: through the seed-label rule,
  // so a held Borrowed reads in the language of the app, not as its stored name.
  const pickedCategory = snapshot.categories.find((category) => category.id === pickedCategoryId);
  const effectiveCategoryName =
    pickedCategoryId === null || pickedCategory === undefined
      ? detailCategory
      : labelOf({ name: pickedCategory.name, externalId: pickedCategory.externalId });
  // The pick until it is saved, the saved row afterwards — `accountId`'s own rule.
  // The pick until it is saved, the saved row afterwards — `accountId`'s own
  // rule, once per link. A name comes from the directory rather than the row's
  // own join, which carries one name and now has two ids to name.
  const nameOf = (id: string | null): string | null =>
    id === null ? null : (snapshot.counterparties.find((row) => row.id === id)?.name ?? null);
  const effectiveIdentity = pickedCounterparty.identity ?? {
    id: detail.counterpartyId,
    name: nameOf(detail.counterpartyId),
  };
  const effectiveObligation = pickedCounterparty.obligation ?? {
    id: detail.obligationCounterpartyId,
    name: detail.counterpartyName,
  };

  return (
    <PushedPage
      title={dayLabel(shown.date, locale)}
      tint={heroTint(shownCategory, theme, shownTintKey).fill}
      topWash={heroTint(shownCategory, theme, shownTintKey).fill}
      titleNode={
        <HeroHeaderTitle
          scrollY={heroScroll.scrollY}
          date={dayLabel(shown.date, locale)}
          name={shown.enteredName === "" ? t("routes.transaction") : shown.enteredName}
          amount={shown.amount}
          currency={shown.currency}
          decimals={shown.decimals}
          type={shown.type}
        />
      }
      onScroll={heroScroll.onScroll}
    >
      <TransactionHero
        amount={shown.amount}
        currency={shown.currency}
        decimals={shown.decimals}
        type={shown.type}
        accountName={shown.accountName}
        toAccountName={shown.toAccountName}
        categoryName={shownCategory}
        categoryTintKey={shownTintKey}
        enteredName={shown.enteredName}
        brandKey={shown.brandKey}
        scrollY={heroScroll.scrollY}
      />
      {/*
        On a phone the strip spans the page's full content width, outside the
        680pt column, so its scroller can take the gutter back and reach both
        screen edges — an iPad in portrait is a phone here, and inside the
        column its cards were sliced at 720pt. At desk width the cards sit
        side by side inside the column like everything else.
      */}
      {phone ? <ContextStrip cards={stripCards} column={COLUMN} /> : null}
      <View style={styles.content}>
        {phone ? null : <ContextStrip cards={stripCards} column={COLUMN} />}
        <FieldsCard
          fields={toFields(
            detail,
            snapshot.accounts.find((account) => account.id === detail.toAccountId)?.decimals ??
              detail.decimals,
          )}
          accounts={pickerAccounts}
          accountId={effectiveAccountId}
          onOpenAccountPicker={handleOpenAccountPicker}
          toAccountId={effectiveToAccountId}
          onOpenToAccountPicker={handleOpenToAccountPicker}
          today={today}
          categoryId={effectiveCategoryId}
          categoryName={effectiveCategoryName}
          debtCategory={debtIntentOfCategory(effectiveCategoryId) !== null}
          onOpenCategoryPicker={handleOpenCategoryPicker}
          counterpartyId={effectiveIdentity.id}
          counterpartyName={effectiveIdentity.name}
          obligationCounterpartyId={effectiveObligation.id}
          obligationCounterpartyName={effectiveObligation.name}
          onOpenCounterpartyPicker={handleOpenCounterpartyPicker}
          {...(fieldsErrors ? { fieldErrors: fieldsErrors } : {})}
          onSave={handleSaveFields}
        />

        <LinesCard
          lines={detail.lines}
          total={money.abs(detail.amount)}
          currency={detail.currency}
          decimals={detail.decimals}
          {...(linesErrors ? { fieldErrors: linesErrors } : {})}
          onSave={handleSaveLines}
        />
        <View style={styles.deleteAction}>
          <Button label={t("transactions.delete")} onPress={handleDelete} variant="danger" />
        </View>
      </View>
      <CategorySheet
        visible={categorySheetOpen}
        kind={categoryKind}
        tree={snapshot.categoryTree}
        onPick={handlePickCategory}
        onCreate={handleCreateCategory}
        onDismiss={handleDismissCategorySheet}
      />
      <CounterpartyPicker
        visible={pickerTarget !== null}
        counterparties={snapshot.counterparties}
        onPick={handlePickCounterparty}
        onCreateNew={handleCreateCounterparty}
        onDismiss={handleDismissCounterpartyPicker}
      />
      <AccountPicker
        visible={accountPickerFor !== null}
        accounts={pickerAccounts}
        groups={pickerGroups}
        accountId={accountPickerFor === "to" ? effectiveToAccountId : effectiveAccountId}
        onPick={handlePickAccount}
        onCreateAccount={handleCreateAccountFromDetail}
        onDismiss={handleDismissAccountPicker}
      />
    </PushedPage>
  );
}

/** The page's column: the details card's cap, and the context slides' with it. */
const COLUMN = 680;

const useStyles = makeStyles(() => ({
  content: { width: "100%", maxWidth: COLUMN, alignSelf: "flex-start", gap: space.x3 },
  deleteAction: { alignItems: "flex-start", paddingTop: space.xl },
}));
