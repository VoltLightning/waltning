import { settleResidualDirection } from "@waltning/client/counterparties/counterparty-figures";
import { debtIntentOf, effectiveRole } from "@waltning/client/counterparties/debt-intent";
import { planRepayment } from "@waltning/client/counterparties/repayment-plan";
import { useDevicePreference } from "@waltning/client/device/use-device-preference";
import type {
  CreateCategoryDraft,
  PhoneCapturableAccount,
  QuickAddDraft,
} from "@waltning/client/ledger/create-phone-ledger";
import { deviceRuntime } from "@waltning/client/ledger/device-runtime";
import { parseQuickAddRoute } from "@waltning/client/ledger/preview-routes";
import { useCategoryPace } from "@waltning/client/ledger/use-category-pace";
import { useLedgerController } from "@waltning/client/ledger/use-ledger-controller";
import { usePhoneLedger } from "@waltning/client/ledger/use-phone-ledger";
import { acceptProposedCategory } from "@waltning/client/transactions/accept-proposed-category";
import { isCompactWindow } from "@waltning/client/transactions/compact-window";
import {
  soleEligibleAccount,
  useDefaultAccount,
} from "@waltning/client/transactions/default-account";
import { useLastUsedAccount } from "@waltning/client/transactions/last-capture";
import { useForeignSpend } from "@waltning/client/transactions/use-foreign-spend";
import { mapFieldErrors } from "@waltning/client/transport/field-errors";
import { proposeCategory } from "@waltning/core/capture/entered-name-memory";
import { fold } from "@waltning/core/capture/names";
import { recentCategories } from "@waltning/core/capture/recent-categories";
import { accountingDate, clockIn, isAccountingDate } from "@waltning/core/date";
import * as money from "@waltning/core/money";
import { AccountPicker, type AccountPickerAccount } from "@waltning/ui/accounts/account-picker";
import { CategorySheet } from "@waltning/ui/categories/category-sheet";
import { parseAmount } from "@waltning/ui/fx/amount-field";
import { formatRate } from "@waltning/ui/fx/format-rate";
import { drawnNamesOf } from "@waltning/ui/i18n/category-label";
import { KNOWN_PATHS, resolveFieldErrorMessage } from "@waltning/ui/i18n/field-error-messages";
import { dayLabel, decimalMark, weekdayLabel } from "@waltning/ui/i18n/locales";
import { useLocale, useT } from "@waltning/ui/i18n/provider";
import { useCategoryLabel } from "@waltning/ui/i18n/use-category-label";
import { Button } from "@waltning/ui/primitives/button";
import { readTyped } from "@waltning/ui/primitives/clock";
import { useKeyboardHeight } from "@waltning/ui/primitives/keyboard";
import { useSafeArea } from "@waltning/ui/primitives/safe-area";
import { type Segment, SegmentControl } from "@waltning/ui/primitives/segment-control";
import { useBreakpoint } from "@waltning/ui/primitives/use-breakpoint";
import { useSubmitCheck } from "@waltning/ui/primitives/use-submit-check";
import { GroundPanel } from "@waltning/ui/shell/card";
import { text } from "@waltning/ui/theme/fonts";
import { makeStyles } from "@waltning/ui/theme/styles";
import { gutter, space } from "@waltning/ui/tokens";
import { ComposerHeader } from "@waltning/ui/transactions/composer-header";
import {
  type QuickAddCheckField,
  QuickAddComposer,
  type QuickAddComposerAccount,
  type QuickAddComposerForeign,
} from "@waltning/ui/transactions/quick-add-composer";
import {
  type QuickAddAccount,
  QuickAddForm,
  type QuickAddFormForeign,
} from "@waltning/ui/transactions/quick-add-form";
import { router, useLocalSearchParams } from "expo-router";
import { useCallback, useEffect, useMemo, useState } from "react";
import { Alert, Text, useWindowDimensions, View } from "react-native";
import { lastCapture, saveHaptic } from "./platform";

type CreateAccountEscapeDraft = { amount: string; accountId: string | null };
type ObligationRole = "debt" | "contribution";

function handleDeskCancel() {
  router.back();
}

/**
 * The replica's account onto `QuickAddForm`'s own choice shape — the desk
 * fallback's exact, unchanged mapping.
 */
function toChoice(account: PhoneCapturableAccount): QuickAddAccount {
  return {
    id: account.id,
    name: account.name,
    currency: account.currency,
    capturable: account.capturable,
  };
}

/** The replica's account onto `QuickAddComposer`'s own choice shape, with its currency's mark. */
function toComposerChoice(
  account: PhoneCapturableAccount,
  symbols: ReadonlyMap<string, string>,
): QuickAddComposerAccount {
  const symbol = symbols.get(account.currency);
  return {
    id: account.id,
    name: account.name,
    currency: account.currency,
    ...(symbol === undefined ? {} : { symbol }),
    decimals: account.decimals,
    capturable: account.capturable,
    ownership: account.ownership,
  };
}

/** The replica's account onto `AccountPicker`'s own choice shape — grouped, kind-ordered, S16 §3. */
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

function handleDeskCreateAccount(next: CreateAccountEscapeDraft) {
  router.push({
    pathname: "/account/new",
    params: {
      returnTo: "quick-add",
      amount: next.amount,
      ...(next.accountId ? { accountId: next.accountId } : {}),
    },
  });
}

/** The kinds the segment control offers — Transfer is a different composer, and picking it goes there (S05 §9.1). */
type KindSegment = "expense" | "income" | "transfer";

export default function QuickAdd() {
  const t = useT();
  const labelOf = useCategoryLabel();
  const locale = useLocale();
  const raw = useLocalSearchParams<{
    amount?: string | string[];
    accountId?: string | string[];
    type?: string | string[];
    counterpartyId?: string | string[];
  }>();
  const draft = parseQuickAddRoute(raw);
  const ledger = useLedgerController();
  // Subscribed, not a one-shot read: an account created on the sibling route
  // lands in this list the moment the router returns here.
  const snapshot = usePhoneLedger(ledger);
  const accounts = snapshot.accounts.map(toChoice);
  const currencySymbols = useMemo(
    () => new Map(snapshot.currencies.map((currency) => [currency.code, currency.symbol])),
    [snapshot.currencies],
  );
  const composerAccounts = useMemo(
    () => snapshot.accounts.map((account) => toComposerChoice(account, currencySymbols)),
    [snapshot.accounts, currencySymbols],
  );
  const pickerAccounts = snapshot.accounts.map(toPickerChoice);
  const pickerGroups = snapshot.groups.map((group) => ({ id: group.id, name: group.name }));
  const [fieldErrors, setFieldErrors] = useState<ReturnType<typeof mapFieldErrors>>();
  // The device's own calendar (§7.0a) — the draft's default, editable from
  // there. `deviceRuntime` reads `Intl`/`Date` only, not a platform API, so it
  // is the same call `phone-ledger.*.ts` already makes to build the runtime.
  const capture = deviceRuntime().capture();
  const today = capture.date;
  // The wall clock the person is looking at (§7.0a) — `TimeField`'s *Now*.
  const now = clockIn(capture.timeZone, capture.at);
  const breakpoint = useBreakpoint();
  const styles = useStyles();
  const insets = useSafeArea();
  // Beside the JSX rather than in `useStyles`: that cache is keyed on the
  // theme and this is keyed on the device (`ComposerHeader`'s own split).
  const clearTop = { paddingTop: gutter + insets.top };

  /**
   * D4a: S06's sheet is composed here, not inside `QuickAddForm` or
   * `QuickAddComposer` — a domain (`transactions/`) importing a sibling
   * domain (`categories/`) is the thing `architecture/11` names directly, so
   * both forms only ever open a callback this screen owns, the same way
   * they already escape to account creation.
   */
  const [categoryId, setCategoryId] = useState<string | null>(
    snapshot.categories.some((category) => category.id === draft.categoryId)
      ? (draft.categoryId ?? null)
      : null,
  );
  const [categorySheet, setCategorySheet] = useState<{
    open: boolean;
    kind: "income" | "expense";
  }>({ open: false, kind: "expense" });
  const handleOpenCategoryPicker = useCallback(
    (kind: "income" | "expense") => setCategorySheet({ open: true, kind }),
    [],
  );
  const handleDismissCategorySheet = useCallback(
    () => setCategorySheet((current) => ({ ...current, open: false })),
    [],
  );
  const handlePickCategory = useCallback((next: string) => {
    setCategoryId(next);
    setCategorySheet((current) => ({ ...current, open: false }));
  }, []);
  const handleCreateCategory = useCallback(
    (categoryDraft: Omit<CreateCategoryDraft, "drawnNames">) => {
      const result = ledger.createCategory({
        ...categoryDraft,
        drawnNames: drawnNamesOf(labelOf, snapshot.categoryTree),
      });
      if ("id" in result) return { id: result.id };
      return { error: result.fieldErrors[0]?.message ?? t("common.couldNotSave") };
    },
    [ledger, t, labelOf, snapshot.categoryTree],
  );

  /**
   * `AccountPicker` (`accounts/`) is a sibling domain the same way
   * `CategorySheet` is — composed here, not inside `QuickAddForm`. The form's
   * own `amount` is uncontrolled, so its escape carries a snapshot of it at
   * open time; that snapshot is what the picker's own *Create account…*
   * footer forwards on, same shape `handleDeskCreateAccount` already takes.
   */
  const [deskAccountId, setDeskAccountId] = useState<string | null>(
    accounts.some((account) => account.id === draft.accountId) ? (draft.accountId ?? null) : null,
  );
  const [deskAccountPicker, setDeskAccountPicker] = useState<{ open: boolean; amount: string }>({
    open: false,
    amount: draft.amount,
  });
  const handleOpenDeskAccountPicker = useCallback(
    (current: { amount: string }) => setDeskAccountPicker({ open: true, amount: current.amount }),
    [],
  );
  const handleDismissDeskAccountPicker = useCallback(
    () => setDeskAccountPicker((current) => ({ ...current, open: false })),
    [],
  );
  const handlePickDeskAccount = useCallback((next: string) => {
    setDeskAccountId(next);
    setDeskAccountPicker((current) => ({ ...current, open: false }));
  }, []);
  const handleDeskAccountPickerCreateAccount = useCallback(() => {
    handleDeskCreateAccount({ amount: deskAccountPicker.amount, accountId: deskAccountId });
  }, [deskAccountPicker.amount, deskAccountId]);

  /* ── D4b's own draft — the composer above the Dock ─────────────────── */
  const [composerAmountRaw, setComposerAmountRaw] = useState(
    () => draft.amount.replace(".", ",") || "",
  );
  // `FloatingAdd`'s long-press picker (S05 §9.1) — `Income` names it explicitly
  // in the route; every other entry point (a bare tap, S16's account row)
  // leaves it unset and the ordinary default holds.
  const [composerType, setComposerType] = useState<"expense" | "income">(draft.type ?? "expense");
  const [composerAccountId, setComposerAccountId] = useState<string | null>(
    accounts.some((account) => account.id === draft.accountId) ? (draft.accountId ?? null) : null,
  );
  // A category the draft left with (S15's *+ New* round trip), when it is still offered.
  const [composerCategoryId, setComposerCategoryId] = useState<string | null>(
    snapshot.categories.some((category) => category.id === draft.categoryId)
      ? (draft.categoryId ?? null)
      : null,
  );
  /**
   * H1 — S05 §8's Undo, for a proposal the draft applied on its own. Reset
   * whenever the entered name's *fold* changes (the effect beside `enteredNameFold`
   * below): a different entered name earns its own proposal a fresh chance, rather
   * than inheriting a dismissal that was never about it.
   */
  const [categoryProposalDismissed, setCategoryProposalDismissed] = useState(false);
  const [composerEnteredName, setComposerEnteredName] = useState("");
  const [composerDate, setComposerDate] = useState<string>(today);
  // Empty, which is the normal case: a time is set only when someone has one.
  const [composerTime, setComposerTime] = useState<string>("");
  const [composerNote, setComposerNote] = useState("");
  const [composerIsBusiness, setComposerIsBusiness] = useState(false);
  // The same membership check the account gets: a route naming an archived
  // or unknown counterparty would otherwise disable Save with no row to show
  // why and nothing to tap.
  const [composerCounterpartyId, setComposerCounterpartyId] = useState<string | null>(
    snapshot.counterparties.some((counterparty) => counterparty.id === draft.counterpartyId)
      ? (draft.counterpartyId ?? null)
      : null,
  );
  // The role a person chose by hand. A debt category's role is not stored
  // here: it is derived below (`effectiveRole`), so leaving the category takes
  // it back with nothing to clear, and this stays what the person set.
  const [composerObligationRole, setComposerObligationRole] = useState<ObligationRole | null>(null);
  const [composerCategorySheet, setComposerCategorySheet] = useState<{
    open: boolean;
    kind: "income" | "expense";
  }>({ open: false, kind: "expense" });
  /**
   * `AccountPicker` (`accounts/`) is a sibling domain — the same rule
   * `CategorySheet` already keeps. `raw`/`accountId` are already this
   * screen's own state, so — unlike the desk fallback's uncontrolled form —
   * nothing needs capturing at open time.
   */
  const [composerAccountPicker, setComposerAccountPicker] = useState(false);
  const handleOpenComposerAccountPicker = useCallback(() => setComposerAccountPicker(true), []);
  const handleDismissComposerAccountPicker = useCallback(() => setComposerAccountPicker(false), []);

  const lastCaptureSnapshot = useDevicePreference(lastCapture);
  const lastUsedAccountId = useLastUsedAccount(lastCapture, capture.at.getTime(), composerAccounts);
  // Last-used inside its window, else the one account there is (S05 §9.2).
  const defaultAccountId = useDefaultAccount(lastCapture, capture.at.getTime(), composerAccounts);
  const effectiveAccountId = composerAccountId ?? defaultAccountId;
  const accountMachineFilled = composerAccountId === null && defaultAccountId !== null;
  // Only a fill the machine chose between accounts for is expensive to redo
  // (S05 §7); the one account there is, is the ledger and not a guess.
  // The lone account is never a guess, window or no window.
  const guessedAccount =
    composerAccountId === null &&
    lastUsedAccountId !== null &&
    soleEligibleAccount(composerAccounts) === null;
  const selectedComposerAccount = composerAccounts.find(
    (account) => account.id === effectiveAccountId,
  );

  const enteredNameFold = useMemo(() => fold(composerEnteredName), [composerEnteredName]);
  /**
   * M — reset the Undo dismissal only when the entered name's *fold* actually
   * changes, not on every keystroke. `handleComposerEnteredNameChange` used to
   * reset `categoryProposalDismissed` on raw text, so a no-op edit — retype
   * the same fold, or a keystroke `fold` collapses away (case, punctuation,
   * whitespace) — silently revived a proposal someone had just dismissed
   * with S05 §8's own Undo.
   */
  // biome-ignore lint/correctness/useExhaustiveDependencies: enteredNameFold is the trigger; the effect body reads no value from it
  useEffect(() => {
    setCategoryProposalDismissed(false);
  }, [enteredNameFold]);
  // `enteredNameFold` (not `composerEnteredName`) is both the dependency and the value
  // `proposeCategory` is given: `fold` is idempotent, so this is the same
  // match `proposeCategory`'s own internal fold would produce, and it is what
  // keeps `ledger.listEnteredNameHistory()` — a replica read — from re-running on
  // every keystroke that leaves the fold the same, or on an unrelated
  // re-render (a keypad digit, the hero re-painting).
  const categoryProposal = useMemo(
    () => proposeCategory(enteredNameFold, ledger.listEnteredNameHistory()) ?? undefined,
    [ledger, enteredNameFold],
  );
  /**
   * H1 — a proposal at or above the display threshold **is** the draft's
   * category the moment it fills, not only a suggestion the sheet has to
   * confirm (S05 §8). `composerCategoryId` (a real pick) always wins; short
   * of that, the effective category is the proposal's own id, exactly the
   * pattern `effectiveAccountId`/`lastUsedAccountId` already keeps for the
   * account chip.
   *
   * `acceptProposedCategory` (`packages/client`, shared with the desk
   * command bar) is the H1-b membership-and-kind guard: it refuses a
   * proposal whose category is not among `snapshot.categories` at all
   * (H1a — archived, or since deleted, either way absent from that list) or
   * whose kind disagrees with `composerType`. Without the kind half,
   * switching Expense→Income after an expense proposal auto-filled left
   * `effectiveCategoryId` naming the stale expense leaf while the chip
   * itself rendered empty (`QuickAddComposer`'s own `pickedCategory` already
   * filters by kind) — Save would have sent an income row carrying an
   * expense category, invisibly. A type switch needs no separate "clear"
   * action: this is derived fresh from `composerType` every render, so the
   * mismatch alone is what turns it off.
   */
  const categoryAutoFilled =
    composerCategoryId === null &&
    !categoryProposalDismissed &&
    acceptProposedCategory(categoryProposal, snapshot.categories, composerType);
  const effectiveCategoryId =
    composerCategoryId ?? (categoryAutoFilled ? (categoryProposal?.categoryId ?? null) : null);
  const handleUndoCategory = useCallback(() => setCategoryProposalDismissed(true), []);
  /**
   * §6.6 — *Borrowed*, *Lent out* and the two repayments make the entry a
   * debt, read from the category's seed tag and never from its name (which is
   * the person's to rename and the language's to translate).
   */
  const effectiveCategory = snapshot.categories.find(
    (category) => category.id === effectiveCategoryId && category.kind === composerType,
  );
  const intent = debtIntentOf(effectiveCategory?.externalId);
  const debtCategory = intent !== null;
  const obligationRole = effectiveRole(composerObligationRole, intent);
  /**
   * **A repayment is `settle_debt`** (S14), decided here before the write: the
   * person's open debt *in that direction*, the currency it is in, what the
   * entry discharges of it and what is left — or that there is no such debt, or
   * no rate to convert with. `planRepayment` is the one place that is worked
   * out; the hint says it and Save does it.
   */
  const personId = intent?.settles ? composerCounterpartyId : null;
  // biome-ignore lint/correctness/useExhaustiveDependencies: snapshot.revision invalidates the read by identity; it is not read.
  const personBalances = useMemo(
    () =>
      personId === null
        ? []
        : ledger.listCounterpartyBalances(today).filter((row) => row.counterpartyId === personId),
    [ledger, personId, snapshot.revision, today],
  );
  const pickedPerson = snapshot.counterparties.find(
    (counterparty) => counterparty.id === composerCounterpartyId,
  );
  const accountCurrency = selectedComposerAccount?.currency ?? null;
  const enteredAmount = parseAmount(composerAmountRaw);
  // The rate for the day the row is written on, which is the draft's date and
  // not today's: a settlement is valued where it happened.
  const rowDate = isAccountingDate(composerDate) ? accountingDate(composerDate) : today;
  // biome-ignore lint/correctness/useExhaustiveDependencies: snapshot.revision invalidates the read by identity; it is not read.
  const repayment = useMemo(
    () =>
      personId === null
        ? null
        : planRepayment({
            intent,
            balances: personBalances,
            accountCurrency,
            amount: enteredAmount,
            crossRate: (from) =>
              accountCurrency === null
                ? null
                : (ledger.readCrossRate({ from, to: accountCurrency, date: rowDate })?.rate ??
                  null),
          }),
    [
      personId,
      intent,
      personBalances,
      accountCurrency,
      enteredAmount,
      ledger,
      today,
      snapshot.revision,
    ],
  );
  const mark = decimalMark(locale);
  /**
   * §7.8 — the currency chip and the charged figure. **Not offered for a
   * repayment**: that is `settle_debt` (S14), which discharges a debt in its
   * own currency and carries no paid side, so a foreign amount there would be
   * dropped without a word.
   */
  const foreignSpend = useForeignSpend({
    readCrossRate: ledger.readCrossRate,
    revision: snapshot.revision,
    account:
      selectedComposerAccount === undefined
        ? null
        : {
            currency: selectedComposerAccount.currency,
            decimals: selectedComposerAccount.decimals,
          },
    amount: enteredAmount,
    date: composerDate,
  });
  const paidCurrency = foreignSpend.paidCurrency;
  // A repayment is `settle_debt`, which has no paid side: the amount would be read in the
  // account's currency. Refused at Save, with the chip still there to go back to the account's own.
  const repaymentInForeign = intent?.settles === true && paidCurrency !== null;
  const chargedAmount = paidCurrency === null ? null : parseAmount(foreignSpend.chargedRaw);
  const paidChoices = useMemo(
    () => snapshot.currencies.map((currency) => ({ code: currency.code, name: currency.name })),
    [snapshot.currencies],
  );
  const foreignHint =
    paidCurrency === null || selectedComposerAccount === undefined
      ? undefined
      : foreignSpend.rate === null
        ? t("transactions.chargedNoRate", { paid: paidCurrency })
        : t(
            // A leg carried forward from an earlier day says so, rather than "this day".
            foreignSpend.rate.asOf === composerDate
              ? "transactions.chargedRate"
              : "transactions.chargedRateCarried",
            {
              paid: paidCurrency,
              rate: formatRate(foreignSpend.rate.rate, locale),
              charged: selectedComposerAccount.symbol ?? selectedComposerAccount.currency,
              date: dayLabel(foreignSpend.rate.asOf, locale),
            },
          );
  const foreign: QuickAddComposerForeign = {
    currencies: paidChoices,
    paidCurrency,
    onPaidCurrencyChange: foreignSpend.setPaidCurrency,
    paidDecimals:
      snapshot.currencies.find((currency) => currency.code === paidCurrency)?.decimals ?? 2,
    chargedRaw: foreignSpend.chargedRaw,
    onChargedChange: foreignSpend.setChargedRaw,
    hint: foreignHint,
  };
  const repaymentProblem =
    repayment?.kind === "no-debt" && pickedPerson !== undefined
      ? t("transactions.nothingToSettle", { name: pickedPerson.name })
      : repayment?.kind === "no-rate"
        ? t("transactions.settleNeedsRate", { currency: repayment.currency })
        : undefined;
  const debtHint =
    repayment === null || pickedPerson === undefined
      ? undefined
      : repayment.kind === "settle"
        ? [
            t(
              intent?.direction === "owed" ? "transactions.settlesOwed" : "transactions.settlesOwe",
              {
                name: pickedPerson.name,
                currency: repayment.currency,
              },
            ),
            repayment.over
              ? t("counterparties.overSettled", {
                  amount: `${money.forDisplay(money.abs(repayment.residual), repayment.decimals, mark)}\u00a0${repayment.currency}`,
                })
              : null,
          ]
            .filter((part) => part !== null)
            .join(" ")
        : repaymentProblem;

  const handleRawChange = useCallback((next: string) => setComposerAmountRaw(next), []);
  const handleLeaveForTransfer = useCallback(() => router.replace("/transfer"), []);
  /**
   * The segment control's three kinds. Expense and Income switch the draft in
   * place — the amount, account and note survive the switch, only the
   * category (which is per kind) is re-derived. **Transfer leaves.** A
   * transfer is two accounts, two amounts and a live rate (S05 §9.1), and
   * S31 is its composer; the segment is the deck's way of offering it from
   * here, and `replace` rather than `push` so the way back from S31 is the
   * tab the reader came from, not an abandoned expense draft.
   */
  const handleKindSegment = useCallback(
    (next: KindSegment) => {
      if (next === "transfer") {
        // §7's own rule, the same one ✕ keeps: leaving is cheap when the
        // draft is your own typing, and asked about when a machine filled
        // something — the segment is a way out of this draft too.
        if (!guessedAccount) {
          router.replace("/transfer");
          return;
        }
        Alert.alert(t("common.discardTitle"), t("common.discardBody"), [
          { text: t("common.cancel"), style: "cancel" },
          { text: t("common.discard"), style: "destructive", onPress: handleLeaveForTransfer },
        ]);
        return;
      }
      setComposerType(next);
      // A category is per kind: a manual pick made under the other kind would
      // otherwise survive here invisibly — the row filters it out of view
      // while Save still carried its id into `categoryKindMismatch`.
      setComposerCategoryId(null);
    },
    [guessedAccount, handleLeaveForTransfer, t],
  );
  const kindSegments = useMemo<
    readonly [Segment<KindSegment>, Segment<KindSegment>, Segment<KindSegment>]
  >(
    () => [
      { value: "expense", label: t("transactions.expense") },
      { value: "income", label: t("transactions.income") },
      { value: "transfer", label: t("transactions.transfer") },
    ],
    [t],
  );
  /**
   * **§6.7's guarantee, held across a mid-draft account switch.** Picking
   * *Business* happens on an own account (`ScopeSegments` refuses the tap on
   * a shared one), but `composerIsBusiness` is state this screen owns
   * independently of the account chip — switching the account chip to a
   * shared account afterwards does not touch it on its own. Left alone, Save
   * would carry `isBusiness: true` into a shared account exactly the way
   * `ScopeSegments` exists to prevent, just reached from the other chip.
   */
  /**
   * H2 — an account switch to a smaller scale never silently changes the
   * typed figure. `createTransaction`'s own `transactions.tooManyDecimals`
   * refusal (`create-phone-ledger.ts`) is what a Save would hit; this is the
   * same fact, caught the moment the switch itself would have made it true,
   * so the draft never carries an amount its new account cannot hold. The
   * switch is refused outright — the account stays as it was — rather than
   * truncating the amount on the person's behalf.
   */
  const handleComposerAccountChange = useCallback(
    (next: string) => {
      const account = composerAccounts.find((candidate) => candidate.id === next);
      const parsedAmount = parseAmount(composerAmountRaw);
      // §7.8 — in a foreign currency the typed figure is not in the account's
      // scale at all; the charged figure is checked at Save.
      if (
        paidCurrency === null &&
        account !== undefined &&
        parsedAmount !== null &&
        money.dec(parsedAmount).decimalPlaces() > account.decimals
      ) {
        const message = t("transactions.tooManyDecimals", {
          currency: account.currency,
          decimals: String(account.decimals),
        });
        setFieldErrors(mapFieldErrors([{ path: "accountId", message }], KNOWN_PATHS));
        return;
      }
      setFieldErrors(undefined);
      setComposerAccountId(next);
      if (account?.ownership === "shared") setComposerIsBusiness(false);
    },
    [composerAccounts, composerAmountRaw, paidCurrency, t],
  );
  const handlePickComposerAccount = useCallback(
    (next: string) => {
      handleComposerAccountChange(next);
      setComposerAccountPicker(false);
    },
    [handleComposerAccountChange],
  );
  const handleComposerCreateAccount = useCallback(() => {
    router.push({
      pathname: "/account/new",
      params: {
        returnTo: "quick-add",
        amount: composerAmountRaw,
        ...(effectiveAccountId ? { accountId: effectiveAccountId } : {}),
      },
    });
  }, [composerAmountRaw, effectiveAccountId]);
  /**
   * S15 §2's own entry — the counterparty chip's *+ New*. Round-trips the
   * draft the same way `handleComposerCreateAccount` above does: this screen
   * unmounts on the push, so the amount and account come back through the
   * route rather than surviving in state that no longer exists.
   */
  const handleComposerCreateCounterparty = useCallback(() => {
    router.push({
      pathname: "/counterparty/new",
      params: {
        returnTo: "quick-add",
        amount: composerAmountRaw,
        type: composerType,
        ...(effectiveAccountId ? { accountId: effectiveAccountId } : {}),
        // A debt's Who? sends the person here; the category it was asked for
        // must still be the category when they come back.
        ...(effectiveCategoryId ? { categoryId: effectiveCategoryId } : {}),
      },
    });
  }, [composerAmountRaw, composerType, effectiveAccountId, effectiveCategoryId]);
  const needsRateCurrency =
    selectedComposerAccount !== undefined && !selectedComposerAccount.capturable
      ? selectedComposerAccount.currency
      : undefined;
  /**
   * §14.6's refusal, with a way out. The composer states *"PLN needs an
   * exchange rate…"* and this is the door it opens: S18, already scoped to
   * the currency that is blocking the save and to the draft's own accounting
   * date (§7.0a — the device's calendar, a bare `YYYY-MM-DD`, never a
   * `Date`). The route lives here because `packages/ui` names no router
   * (`architecture/11`); the composer only ever asks.
   */
  const handleSetRate = useCallback(() => {
    if (needsRateCurrency === undefined) return;
    router.push({
      pathname: "/settings/rates",
      params: { quote: needsRateCurrency, date: today },
    });
  }, [needsRateCurrency, today]);
  const handleComposerOpenCategoryPicker = useCallback(
    () => setComposerCategorySheet({ open: true, kind: composerType }),
    [composerType],
  );
  const handleDismissComposerCategorySheet = useCallback(
    () => setComposerCategorySheet((current) => ({ ...current, open: false })),
    [],
  );
  /**
   * S06's *You used these last*, read when the sheet opens — D2's history is
   * the same read the suggestion makes, and a closed sheet asks for nothing.
   */
  const recentCategoryIds = useMemo(() => {
    if (!composerCategorySheet.open) return [];
    const eligible = new Set(
      snapshot.categories
        .filter((category) => category.kind === composerCategorySheet.kind)
        .map((category) => category.id),
    );
    return recentCategories(ledger.listEnteredNameHistory(), eligible);
  }, [composerCategorySheet, ledger, snapshot.categories]);
  const categoryUsage = useMemo(
    () => Object.fromEntries(snapshot.categoryUsage),
    [snapshot.categoryUsage],
  );
  const handlePickComposerCategory = useCallback((next: string) => {
    setComposerCategoryId(next);
    setComposerCategorySheet((current) => ({ ...current, open: false }));
  }, []);
  const handleComposerEnteredNameChange = useCallback((next: string) => {
    setComposerEnteredName(next);
  }, []);
  const handleComposerDateChange = useCallback((next: string) => setComposerDate(next), []);
  const handleComposerBusinessChange = useCallback(
    (next: boolean) => setComposerIsBusiness(next),
    [],
  );
  const handleComposerNoteChange = useCallback((next: string) => setComposerNote(next), []);
  /**
   * The one line under the figure — *Groceries this month: 61% of usual*. A
   * pace against the reader's own previous months, in the category the draft
   * holds, for an own account (a shared account's spend is not one person's
   * habit). Worded here, because the composer draws finished sentences and
   * `packages/ui` names no ledger.
   */
  const pace = useCategoryPace(
    ledger,
    selectedComposerAccount?.ownership === "shared" ? null : effectiveCategoryId,
    selectedComposerAccount?.currency ?? null,
    today,
    snapshot.revision,
  );
  const paceCategory = snapshot.categories.find((category) => category.id === effectiveCategoryId);
  const paceLine =
    pace === null || paceCategory === undefined
      ? undefined
      : t("transactions.categoryPace", {
          category: labelOf(paceCategory),
          percent: String(pace.percent),
        });
  const handleComposerCounterpartyChange = useCallback(
    (next: string) => setComposerCounterpartyId(next),
    [],
  );
  const handleComposerObligationRoleChange = useCallback((next: ObligationRole | null) => {
    setComposerObligationRole(next);
  }, []);

  const handleDiscard = useCallback(() => router.back(), []);
  const handleComposerCancel = useCallback(() => {
    // S05 §7: discarding your own typing is cheap to redo; discarding a
    // machine's guess is not — the confirm exists for exactly the one thing
    // the keypad path ever fills on its own.
    if (!guessedAccount) {
      router.back();
      return;
    }
    Alert.alert(t("common.discardTitle"), t("common.discardBody"), [
      { text: t("common.cancel"), style: "cancel" },
      { text: t("common.discard"), style: "destructive", onPress: handleDiscard },
    ]);
  }, [guessedAccount, handleDiscard, t]);

  // §6.6, never defaulted: a counterparty picked with no role would reach
  // `create_transaction`'s own refine and refuse — so Save refuses first, and
  // says so on the row (`counterpartyValue`'s "role?" suffix already asks).
  //
  // §14.6, the same rule: `selectedComposerAccount.capturable === false` is
  // knowable the moment the account chip fills, not only once
  // `create_transaction` bounces it — `QuickAddForm` refuses the same way.
  // Drawn order. Each is what used to keep Save disabled, now said on the
  // field it is about when Save is pressed.
  const composerCheck = useSubmitCheck<QuickAddCheckField>({
    amount:
      (parseAmount(composerAmountRaw) === null && t("common.required")) ||
      (repaymentInForeign && t("transactions.paidNotForRepayment")),
    // §7.8 — what the account was charged is every balance's figure, so it is
    // required whenever the amount is in another currency.
    charged: paidCurrency !== null && chargedAmount === null && t("common.required"),
    account:
      effectiveAccountId === null
        ? t("common.chooseOne")
        : selectedComposerAccount?.capturable === false &&
          t("transactions.needsRate", { currency: selectedComposerAccount.currency }),
    // §6.6 — a debt is between two people: a debt category is refused
    // without the other one, on the Who? row it asked it on.
    who:
      debtCategory && composerCounterpartyId === null
        ? t("transactions.whoRequired")
        : repaymentProblem !== undefined && repaymentProblem,
    // §6.6.1 — **no longer required.** Naming a counterparty used to force a
    // role, because `reference` was the only way to say "involved, owes
    // nothing" and the pair-shape CHECK refused a party without one. The
    // identity link says that by itself now, so a role is what somebody
    // chooses when there *is* an obligation, and its absence is an ordinary
    // answer rather than an unfinished form.
  });
  const saveComposer = useCallback(() => {
    const amount = parseAmount(composerAmountRaw);
    if (amount === null || effectiveAccountId === null) return;
    if (paidCurrency !== null && chargedAmount === null) return;
    const next: QuickAddDraft = {
      type: composerType,
      // §7.8 — the entry's own figure is what the account was charged; what was
      // typed is the paid side of the same payment.
      amount: chargedAmount ?? amount,
      ...(paidCurrency === null ? {} : { paidAmount: amount, paidCurrency }),
      accountId: effectiveAccountId,
      categoryId: effectiveCategoryId,
      enteredName: composerEnteredName,
      date: composerDate,
      // Read loosely (`0930`, `9.30`) and sent strictly; what does not read as
      // a time is sent as typed, so the refusal lands on the row that holds it.
      ...(composerTime.trim() === ""
        ? {}
        : { timeOfDay: readTyped(composerTime) ?? composerTime.trim() }),
      note: composerNote,
      isBusiness: composerIsBusiness,
      // The picker names who the transaction was **with** — the identity
      // link, and the answer for the ordinary case. A role turns that into an
      // obligation *as well*, with the same counterparty on both: the two
      // differing is S09's edit, not something one chip row can express.
      counterpartyId: composerCounterpartyId,
      obligationCounterpartyId: obligationRole === null ? null : composerCounterpartyId,
      obligationRole,
    };
    /**
     * **A repayment is `settle_debt`** (S14): same person, same role, the
     * discharge stamped in the debt's own currency, the direction checked
     * against the live balance and over-settlement stated rather than clamped.
     * Only when there is an open debt in the matching direction
     * (`planRepayment`); with none, Save was already refused on Who?.
     */
    if (
      repayment?.kind === "settle" &&
      composerCounterpartyId !== null &&
      selectedComposerAccount !== undefined
    ) {
      const settled = ledger.settleDebt({
        counterpartyId: composerCounterpartyId,
        accountId: effectiveAccountId,
        date: composerDate,
        amount,
        currency: selectedComposerAccount.currency,
        dischargesCurrency: repayment.currency,
        dischargesAmount: repayment.dischargesAmount,
        note: composerNote,
        categoryId: effectiveCategoryId,
      });
      if (!("id" in settled)) {
        const resolved = settled.fieldErrors.map((error) => ({
          path: error.path,
          message: resolveFieldErrorMessage(t, error),
        }));
        setFieldErrors(mapFieldErrors(resolved, KNOWN_PATHS));
        return;
      }
      setFieldErrors(undefined);
      void lastCapture.set({ accountId: effectiveAccountId, at: Date.now() });
      saveHaptic();
      router.dismissTo({
        pathname: "/",
        params: {
          message: t("counterparties.settledToast", {
            amount: money.forDisplay(money.abs(settled.residual), repayment.decimals, mark),
            currency: repayment.currency,
            direction: t(
              `counterparties.${settleResidualDirection(settled.residual, repayment.decimals)}`,
            ),
          }),
          nonce: String(Date.now()),
        },
      });
      return;
    }
    const result = ledger.createTransaction(next);
    if (!("id" in result)) {
      const resolved = result.fieldErrors.map((error) => ({
        path: error.path,
        message: resolveFieldErrorMessage(t, error),
      }));
      setFieldErrors(mapFieldErrors(resolved, KNOWN_PATHS));
      return;
    }
    setFieldErrors(undefined);
    void lastCapture.set({ accountId: effectiveAccountId, at: Date.now() });
    saveHaptic();
    // #116 review, L2 — `deferred` is still a save: the capture is on the
    // outbox, only not yet valued (no FX rate). Dismissed exactly as an
    // ordinary save, with the same route-param `Toast` `transaction-detail-
    // screen.tsx`'s own delete uses, so the person sees "saved", never a
    // field marked invalid on a draft that has already gone.
    if (result.deferred) {
      router.dismissTo({
        pathname: "/",
        params: {
          message: t("transactions.deferredNoRate", {
            currency: selectedComposerAccount?.currency ?? "",
          }),
          nonce: String(Date.now()),
        },
      });
      return;
    }
    router.dismissTo("/");
  }, [
    composerAmountRaw,
    paidCurrency,
    chargedAmount,
    effectiveCategoryId,
    composerCounterpartyId,
    obligationRole,
    repayment,
    mark,
    composerDate,
    composerTime,
    composerIsBusiness,
    composerNote,
    composerEnteredName,
    composerType,
    effectiveAccountId,
    ledger,
    selectedComposerAccount,
    t,
  ]);
  const handleComposerSave = useCallback(
    () => composerCheck.submit(saveComposer),
    [composerCheck, saveComposer],
  );

  // The footer clears the home indicator itself, the way the band above
  // clears the notch: `GroundPanel` between them clears neither edge.
  /**
   * **The footer rides above the keyboard, and the home indicator's inset goes
   * with it.** S05 §3 puts Save at the bottom edge because it is pressed in
   * motion — and with the keyboard up that edge was *behind* the keyboard, so
   * the one affirmative action on the screen was covered the whole time
   * someone was typing the amount. `useKeyboardHeight` measures the overlap;
   * the safe-area inset is dropped while it is non-zero, because the keyboard
   * is already covering the indicator and paying for both lifts the footer a
   * second time.
   */
  const keyboardHeight = useKeyboardHeight();
  const keyboardUp = keyboardHeight > 0;
  /**
   * A short window is decided from the first frame, from the window's own
   * height — never from the keyboard's events, which would collapse the page
   * under the thumb on every open (and a mobile browser's viewport shrinks
   * instead, reporting no keyboard at all). S05 §3.
   */
  const window = useWindowDimensions();
  const compact = isCompactWindow(window.height, window.fontScale);
  const clearBottom = {
    paddingBottom: keyboardUp ? space.md + keyboardHeight : gutter + insets.bottom,
  };
  const composerCategories = useMemo(
    () =>
      snapshot.categories.map((category) => ({
        ...category,
        usage: snapshot.categoryUsage.get(category.id) ?? 0,
      })),
    [snapshot.categories, snapshot.categoryUsage],
  );

  /* ── The desk fallback's own draft ──────────────────────────────────── */
  // §6.6 — which categories are debts, from their seed tags; the form only
  // ever asks whether the picked id is in this list.
  const debtCategoryIds = useMemo(
    () =>
      snapshot.categories
        .filter((category) => debtIntentOf(category.externalId) !== null)
        .map((category) => category.id),
    [snapshot.categories],
  );
  const deskInitialCounterpartyId = snapshot.counterparties.some(
    (counterparty) => counterparty.id === draft.counterpartyId,
  )
    ? (draft.counterpartyId ?? null)
    : null;
  const handleDeskCreateCounterparty = useCallback(
    (current: { amount: string; type: "expense" | "income" }) => {
      router.push({
        pathname: "/counterparty/new",
        params: {
          returnTo: "quick-add",
          amount: current.amount,
          type: current.type,
          ...(deskAccountId ? { accountId: deskAccountId } : {}),
          ...(categoryId ? { categoryId } : {}),
        },
      });
    },
    [deskAccountId, categoryId],
  );

  /**
   * §7.8 — the desk form's currency choice and the day's cross rate. Read live
   * on every render of the form, so a rate set elsewhere is the rate it uses.
   */
  const deskForeign = useMemo<QuickAddFormForeign>(
    () => ({
      currencies: paidChoices,
      readCrossRate: ({ from, to, date }) => {
        if (!isAccountingDate(date)) return null;
        const found = ledger.readCrossRate({
          from: money.currencyCode(from),
          to: money.currencyCode(to),
          date: accountingDate(date),
        });
        if (found === null) return null;
        // The staler leg is the one the figure is only as good as.
        const { from: a, to: b } = found.legs;
        return { rate: found.rate, asOf: a.asOf < b.asOf ? a.asOf : b.asOf };
      },
      decimalsOf: (currency) =>
        snapshot.currencies.find((candidate) => candidate.code === currency)?.decimals ?? 2,
    }),
    [ledger, paidChoices, snapshot.currencies],
  );
  const [fieldErrorsDesk, setFieldErrorsDesk] = useState<ReturnType<typeof mapFieldErrors>>();
  const handleDeskSave = useCallback(
    (next: QuickAddDraft) => {
      /**
       * §6.6 — the desk's repayment is `settle_debt` too, the same plan the
       * phone's composer reads: no open debt in the matching direction (or no
       * rate to convert with) is refused on Who?, an open one is settled.
       */
      const deskAccount = composerAccounts.find((candidate) => candidate.id === next.accountId);
      const deskCategory = snapshot.categories.find(
        (candidate) => candidate.id === next.categoryId,
      );
      const deskIntent = debtIntentOf(deskCategory?.externalId);
      const deskPerson = next.obligationCounterpartyId;
      // §7.8 — a repayment is `settle_debt`, which discharges a debt in its own
      // currency and has no paid side: refused where it was typed.
      if (deskIntent?.settles && next.paidAmount !== undefined) {
        setFieldErrorsDesk(
          mapFieldErrors(
            [{ path: "paidAmount", message: t("transactions.paidNotForRepayment") }],
            KNOWN_PATHS,
          ),
        );
        return;
      }
      if (deskIntent?.settles && deskPerson !== null && deskAccount !== undefined) {
        const plan = planRepayment({
          intent: deskIntent,
          balances: ledger
            .listCounterpartyBalances(today)
            .filter((row) => row.counterpartyId === deskPerson),
          accountCurrency: deskAccount.currency,
          amount: next.amount,
          crossRate: (from) =>
            ledger.readCrossRate({
              from,
              to: deskAccount.currency,
              date: isAccountingDate(next.date) ? accountingDate(next.date) : today,
            })?.rate ?? null,
        });
        const name = snapshot.counterparties.find((c) => c.id === deskPerson)?.name ?? "";
        const problem =
          plan?.kind === "no-debt"
            ? t("transactions.nothingToSettle", { name })
            : plan?.kind === "no-rate"
              ? t("transactions.settleNeedsRate", { currency: plan.currency })
              : undefined;
        if (problem !== undefined) {
          setFieldErrorsDesk(
            mapFieldErrors([{ path: "obligationCounterpartyId", message: problem }], KNOWN_PATHS),
          );
          return;
        }
        if (plan?.kind === "settle") {
          const settled = ledger.settleDebt({
            counterpartyId: deskPerson,
            accountId: next.accountId,
            date: next.date,
            amount: next.amount,
            currency: deskAccount.currency,
            dischargesCurrency: plan.currency,
            dischargesAmount: plan.dischargesAmount,
            note: next.note,
            categoryId: next.categoryId,
          });
          if (!("id" in settled)) {
            const resolved = settled.fieldErrors.map((error) => ({
              path: error.path,
              message: resolveFieldErrorMessage(t, error),
            }));
            setFieldErrorsDesk(mapFieldErrors(resolved, KNOWN_PATHS));
            return;
          }
          setFieldErrorsDesk(undefined);
          router.dismissTo("/");
          return;
        }
      }
      const result = ledger.createTransaction(next);
      if (!("id" in result)) {
        const resolved = result.fieldErrors.map((error) => ({
          path: error.path,
          message: resolveFieldErrorMessage(t, error),
        }));
        setFieldErrorsDesk(mapFieldErrors(resolved, KNOWN_PATHS));
        return;
      }
      setFieldErrorsDesk(undefined);
      // #116 review, L2 — same rule as the composer's own save above: a
      // deferred capture still dismisses, with a toast instead of a field
      // error.
      if (result.deferred) {
        const account = composerAccounts.find((candidate) => candidate.id === next.accountId);
        router.dismissTo({
          pathname: "/",
          params: {
            message: t("transactions.deferredNoRate", { currency: account?.currency ?? "" }),
            nonce: String(Date.now()),
          },
        });
        return;
      }
      router.dismissTo("/");
    },
    [composerAccounts, ledger, snapshot.categories, snapshot.counterparties, t, today],
  );

  if (breakpoint === "desk") {
    return (
      <View style={styles.root}>
        {/* The route's own name, in a band beside the panel — not inside it.
            The navigation header used to carry it and this route no longer
            has one; the phone's composer states its name in
            `ComposerHeader`'s band, and the desk fallback, which is a form
            rather than a composer, states it here. The same string the
            header showed, so the desk reads exactly as it did.

            Beside, because clearance that scrolls is not clearance:
            `GroundPanel` is the page scroller and never clears the top,
            having been written when every route above it had a header. Zero
            on a browser and on every device that can reach this breakpoint
            today (`app.json` pins portrait and no tablet), so this is the
            shape being right rather than a number anyone will see move. */}
        <View style={[styles.deskBand, clearTop]}>
          <Text style={styles.deskTitle}>{t("routes.expense")}</Text>
        </View>
        <GroundPanel>
          <QuickAddForm
            accounts={accounts}
            categories={snapshot.categories}
            counterparties={snapshot.counterparties}
            today={today}
            initialAmount={draft.amount}
            accountId={deskAccountId}
            onOpenAccountPicker={handleOpenDeskAccountPicker}
            categoryId={categoryId}
            onOpenCategoryPicker={handleOpenCategoryPicker}
            debtCategoryIds={debtCategoryIds}
            initialType={draft.type ?? "expense"}
            initialCounterpartyId={deskInitialCounterpartyId}
            onCreateCounterparty={handleDeskCreateCounterparty}
            {...(fieldErrorsDesk === undefined ? {} : { fieldErrors: fieldErrorsDesk })}
            foreign={deskForeign}
            onCancel={handleDeskCancel}
            onSave={handleDeskSave}
          />
          <CategorySheet
            visible={categorySheet.open}
            kind={categorySheet.kind}
            tree={snapshot.categoryTree}
            onPick={handlePickCategory}
            onCreate={handleCreateCategory}
            onDismiss={handleDismissCategorySheet}
          />
          <AccountPicker
            visible={deskAccountPicker.open}
            accounts={pickerAccounts}
            groups={pickerGroups}
            accountId={deskAccountId}
            onPick={handlePickDeskAccount}
            onCreateAccount={handleDeskAccountPickerCreateAccount}
            onDismiss={handleDismissDeskAccountPicker}
          />
        </GroundPanel>
      </View>
    );
  }

  return (
    <View style={styles.root}>
      {/* The name, the day and the ✕, in a fixed band above the page scroller:
          `app/_layout.tsx` hides the navigation header on this route, so
          this is the header, and a header inside `GroundPanel`'s own
          `ScrollView` scrolls under the notch the moment the column
          overflows. */}
      <ComposerHeader
        onCancel={handleComposerCancel}
        title={t(
          composerType === "expense"
            ? "transactions.addExpenseTitle"
            : "transactions.addIncomeTitle",
        )}
        {...(compact && composerDate === today
          ? {}
          : { subtitle: weekdayLabel(accountingDate(composerDate), locale) })}
      />
      {/* `clearBottom={false}` — this panel is not the screen's own bottom
          edge, the Save footer below it is, and that clears the home
          indicator itself. */}
      <GroundPanel clearBottom={false}>
        <View style={compact ? styles.columnCompact : styles.column}>
          <SegmentControl
            segments={kindSegments}
            value={composerType}
            onChange={handleKindSegment}
          />
          <QuickAddComposer
            raw={composerAmountRaw}
            onRawChange={handleRawChange}
            type={composerType}
            accounts={composerAccounts}
            accountId={effectiveAccountId}
            accountMachineFilled={accountMachineFilled}
            compact={compact}
            onOpenAccountPicker={handleOpenComposerAccountPicker}
            onSetRate={handleSetRate}
            categories={composerCategories}
            categoryId={effectiveCategoryId}
            /*
             * M — withheld once dismissed, not only while `categoryAutoFilled`
             * is false for some other reason: the composer's own "shown, not
             * yet applied" state (S05 §8's amber, pre-`categoryAutoFilled`)
             * cannot otherwise tell "never applied" apart from "Undo just
             * dismissed it", and showed the proposal machine-filled again the
             * instant Undo ran, at or above §14's threshold, defeating Undo
             * outright. `CategorySheet` below still gets the proposal
             * regardless — a deliberate open of the sheet is not the passive
             * auto-fill Undo exists to reverse.
             */
            {...(categoryProposal === undefined || categoryProposalDismissed
              ? {}
              : { categoryProposal })}
            categoryAutoFilled={categoryAutoFilled}
            onUndoCategory={handleUndoCategory}
            onOpenCategoryPicker={handleComposerOpenCategoryPicker}
            onPickCategory={handlePickComposerCategory}
            pace={paceLine}
            enteredName={composerEnteredName}
            onEnteredNameChange={handleComposerEnteredNameChange}
            date={composerDate}
            time={composerTime}
            onTimeChange={setComposerTime}
            now={now}
            onDateChange={handleComposerDateChange}
            today={today}
            isBusiness={composerIsBusiness}
            onBusinessChange={handleComposerBusinessChange}
            note={composerNote}
            onNoteChange={handleComposerNoteChange}
            counterparties={snapshot.counterparties}
            obligationCounterpartyId={composerCounterpartyId}
            onCounterpartyChange={handleComposerCounterpartyChange}
            obligationRole={obligationRole}
            onObligationRoleChange={handleComposerObligationRoleChange}
            onCreateCounterparty={handleComposerCreateCounterparty}
            debtCategory={debtCategory}
            debtHint={debtHint}
            {...(fieldErrors === undefined ? {} : { fieldErrors })}
            check={composerCheck}
            foreign={foreign}
          />
        </View>
      </GroundPanel>
      {/* S05 §3 — Save is full-width at the bottom edge, because it is the
          only affirmative action and it is pressed in motion; the line above
          it says what Save means on a phone that may be offline (§6). */}
      <View style={[styles.footer, compact ? styles.footerCompact : null, clearBottom]}>
        {compact ? null : <Text style={styles.footerNote}>{t("transactions.savedOnPhone")}</Text>}
        <Button
          variant="primary"
          size="lg"
          label={t(
            composerType === "expense" ? "transactions.saveExpense" : "transactions.saveIncome",
          )}
          onPress={handleComposerSave}
        />
      </View>
      <CategorySheet
        visible={composerCategorySheet.open}
        kind={composerCategorySheet.kind}
        tree={snapshot.categoryTree}
        usage={categoryUsage}
        recent={recentCategoryIds}
        enteredName={composerEnteredName}
        {...(categoryProposal === undefined ? {} : { proposal: categoryProposal })}
        onPick={handlePickComposerCategory}
        onCreate={handleCreateCategory}
        onDismiss={handleDismissComposerCategorySheet}
      />
      <AccountPicker
        visible={composerAccountPicker}
        accounts={pickerAccounts}
        groups={pickerGroups}
        accountId={effectiveAccountId}
        {...(lastUsedAccountId === null ? {} : { lastUsedId: lastUsedAccountId })}
        {...(lastCaptureSnapshot.value ? { lastUsedAt: lastCaptureSnapshot.value.at } : {})}
        onPick={handlePickComposerAccount}
        onCreateAccount={handleComposerCreateAccount}
        onDismiss={handleDismissComposerAccountPicker}
      />
    </View>
  );
}

const useStyles = makeStyles((theme) => ({
  root: { flex: 1, backgroundColor: theme.ground },
  /** The desk fallback's own header band — `ComposerHeader`'s shape, without a ✕ the form already carries as *Cancel*. */
  deskBand: {
    backgroundColor: theme.ground,
    paddingHorizontal: gutter,
    paddingBottom: space.x3,
  },
  /** Its heading — the navigation header's own face (`_layout.tsx`'s `headerTitleStyle`). */
  deskTitle: { color: theme.text, ...text.ui("displayThree") },
  /** The deck's 20 between the kind control and the amount card. */
  column: { gap: space.x4 },
  /** The same column on a short window — 6 between blocks, so the account row is in the first view. */
  columnCompact: { gap: space.sm },
  footer: {
    backgroundColor: theme.ground,
    paddingHorizontal: gutter,
    paddingTop: space.lg,
    gap: space.lg,
  },
  footerCompact: { paddingTop: 0 },
  footerNote: { color: theme.textMuted, ...text.ui("caption"), textAlign: "center" },
}));
