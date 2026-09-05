import { useDevicePreference } from "@waltning/client/device/use-device-preference";
import type {
  CreateCategoryDraft,
  PhoneCapturableAccount,
  QuickAddDraft,
} from "@waltning/client/ledger/create-phone-ledger";
import { deviceRuntime } from "@waltning/client/ledger/device-runtime";
import { parseQuickAddRoute } from "@waltning/client/ledger/preview-routes";
import { useLedgerController } from "@waltning/client/ledger/use-ledger-controller";
import { usePhoneLedger } from "@waltning/client/ledger/use-phone-ledger";
import { useLastUsedAccount } from "@waltning/client/transactions/last-capture";
import { mapFieldErrors } from "@waltning/client/transport/field-errors";
import { fold } from "@waltning/core/capture/names";
import { PROPOSAL_DISPLAY_THRESHOLD, proposeCategory } from "@waltning/core/capture/payee-memory";
import * as money from "@waltning/core/money";
import { AccountPicker, type AccountPickerAccount } from "@waltning/ui/accounts/account-picker";
import { CategorySheet } from "@waltning/ui/categories/category-sheet";
import { parseAmount } from "@waltning/ui/fx/amount-field";
import { useT } from "@waltning/ui/i18n/provider";
import { useBreakpoint } from "@waltning/ui/primitives/use-breakpoint";
import { Card, GroundPanel } from "@waltning/ui/shell/card";
import { makeStyles } from "@waltning/ui/theme/styles";
import { applyKey } from "@waltning/ui/transactions/amount-keys";
import { Dock, type DockModeOption } from "@waltning/ui/transactions/dock";
import {
  KNOWN_PATHS,
  resolveFieldErrorMessage,
} from "@waltning/ui/transactions/field-error-messages";
import { Keypad, type KeypadKey } from "@waltning/ui/transactions/keypad";
import {
  QuickAddComposer,
  type QuickAddComposerAccount,
} from "@waltning/ui/transactions/quick-add-composer";
import { type QuickAddAccount, QuickAddForm } from "@waltning/ui/transactions/quick-add-form";
import { router, useLocalSearchParams } from "expo-router";
import { useCallback, useEffect, useMemo, useState } from "react";
import { Alert, View } from "react-native";
import { lastCapture, saveHaptic } from "./platform";

type CreateAccountEscapeDraft = { amount: string; accountId: string | null };
type CounterpartyRole = "debt" | "contribution" | "reference";

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

/** The replica's account onto `QuickAddComposer`'s own choice shape. */
function toComposerChoice(account: PhoneCapturableAccount): QuickAddComposerAccount {
  return {
    id: account.id,
    name: account.name,
    currency: account.currency,
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

export default function QuickAdd() {
  const t = useT();
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
  const composerAccounts = snapshot.accounts.map(toComposerChoice);
  const pickerAccounts = snapshot.accounts.map(toPickerChoice);
  const pickerGroups = snapshot.groups.map((group) => ({ id: group.id, name: group.name }));
  const [fieldErrors, setFieldErrors] = useState<ReturnType<typeof mapFieldErrors>>();
  // The device's own calendar (§7.0a) — the draft's default, editable from
  // there. `deviceRuntime` reads `Intl`/`Date` only, not a platform API, so it
  // is the same call `phone-ledger.*.ts` already makes to build the runtime.
  const capture = deviceRuntime().capture();
  const today = capture.date;
  const breakpoint = useBreakpoint();
  const styles = useStyles();

  /**
   * D4a: S06's sheet is composed here, not inside `QuickAddForm` or
   * `QuickAddComposer` — a domain (`transactions/`) importing a sibling
   * domain (`categories/`) is the thing `architecture/11` names directly, so
   * both forms only ever open a callback this screen owns, the same way
   * they already escape to account creation.
   */
  const [categoryId, setCategoryId] = useState<string | null>(null);
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
    (categoryDraft: CreateCategoryDraft) => {
      const result = ledger.createCategory(categoryDraft);
      if ("id" in result) return { id: result.id };
      return { error: result.fieldErrors[0]?.message ?? t("common.couldNotSave") };
    },
    [ledger, t],
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
  const [composerCategoryId, setComposerCategoryId] = useState<string | null>(null);
  /**
   * H1 — S05 §8's Undo, for a proposal the draft applied on its own. Reset
   * whenever the payee's *fold* changes (the effect beside `payeeFold`
   * below): a different payee earns its own proposal a fresh chance, rather
   * than inheriting a dismissal that was never about it.
   */
  const [categoryProposalDismissed, setCategoryProposalDismissed] = useState(false);
  const [composerPayee, setComposerPayee] = useState("");
  const [composerDate, setComposerDate] = useState<string>(today);
  const [composerNote, setComposerNote] = useState("");
  const [composerIsBusiness, setComposerIsBusiness] = useState(false);
  const [composerCounterpartyId, setComposerCounterpartyId] = useState<string | null>(
    draft.counterpartyId ?? null,
  );
  const [composerCounterpartyRole, setComposerCounterpartyRole] = useState<CounterpartyRole | null>(
    null,
  );
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
  const effectiveAccountId = composerAccountId ?? lastUsedAccountId;
  const accountMachineFilled = composerAccountId === null && lastUsedAccountId !== null;
  const selectedComposerAccount = composerAccounts.find(
    (account) => account.id === effectiveAccountId,
  );

  const payeeFold = useMemo(() => fold(composerPayee), [composerPayee]);
  /**
   * M — reset the Undo dismissal only when the payee's *fold* actually
   * changes, not on every keystroke. `handleComposerPayeeChange` used to
   * reset `categoryProposalDismissed` on raw text, so a no-op edit — retype
   * the same fold, or a keystroke `fold` collapses away (case, punctuation,
   * whitespace) — silently revived a proposal someone had just dismissed
   * with S05 §8's own Undo.
   */
  // biome-ignore lint/correctness/useExhaustiveDependencies: payeeFold is the trigger; the effect body reads no value from it
  useEffect(() => {
    setCategoryProposalDismissed(false);
  }, [payeeFold]);
  // `payeeFold` (not `composerPayee`) is both the dependency and the value
  // `proposeCategory` is given: `fold` is idempotent, so this is the same
  // match `proposeCategory`'s own internal fold would produce, and it is what
  // keeps `ledger.listPayeeHistory()` — a replica read — from re-running on
  // every keystroke that leaves the fold the same, or on an unrelated
  // re-render (a keypad digit, the hero re-painting).
  const categoryProposal = useMemo(
    () => proposeCategory(payeeFold, ledger.listPayeeHistory()) ?? undefined,
    [ledger, payeeFold],
  );
  /**
   * H1-b — the proposal's own category kind, read off the replica the same
   * way `pickedCategory`/`proposedCategory` already gate by `kind === type`
   * inside `QuickAddComposer` (`transactions_category_shape`, §7's own
   * rule: a category attaches to income or expense, never either
   * interchangeably). `proposeCategory` itself carries no `kind` — the
   * category tree is a client concern (`payee-memory.ts`'s own doc) — so
   * this is the one lookup that answers it.
   */
  const proposedCategoryKind = categoryProposal
    ? snapshot.categories.find((category) => category.id === categoryProposal.categoryId)?.kind
    : undefined;
  /**
   * H1 — a proposal at or above `PROPOSAL_DISPLAY_THRESHOLD` **is** the
   * draft's category the moment it fills, not only a suggestion the sheet
   * has to confirm (S05 §8). `composerCategoryId` (a real pick) always wins;
   * short of that, the effective category is the proposal's own id, exactly
   * the pattern `effectiveAccountId`/`lastUsedAccountId` already keeps for
   * the account chip.
   *
   * H1-b — and only while the proposal's own kind still matches
   * `composerType`. Without this, switching Expense→Income after an expense
   * proposal auto-filled left `effectiveCategoryId` naming the stale
   * expense leaf while the chip itself rendered empty (`QuickAddComposer`'s
   * own `pickedCategory` already filters by kind) — Save would have sent an
   * income row carrying an expense category, invisibly. A type switch needs
   * no separate "clear" action: this is derived fresh from `composerType`
   * every render, so the mismatch alone is what turns it off.
   */
  const categoryAutoFilled =
    composerCategoryId === null &&
    categoryProposal !== undefined &&
    categoryProposal.confidence >= PROPOSAL_DISPLAY_THRESHOLD &&
    !categoryProposalDismissed &&
    proposedCategoryKind === composerType;
  const effectiveCategoryId =
    composerCategoryId ?? (categoryAutoFilled ? (categoryProposal?.categoryId ?? null) : null);
  const handleUndoCategory = useCallback(() => setCategoryProposalDismissed(true), []);

  const handleKey = useCallback(
    (key: KeypadKey) =>
      setComposerAmountRaw((current) =>
        applyKey(current, key, selectedComposerAccount?.decimals ?? 2),
      ),
    [selectedComposerAccount?.decimals],
  );
  const handleComposerTypeChange = useCallback((next: "expense" | "income") => {
    setComposerType(next);
  }, []);
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
      if (
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
    [composerAccounts, composerAmountRaw, t],
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
        ...(effectiveAccountId ? { accountId: effectiveAccountId } : {}),
      },
    });
  }, [composerAmountRaw, effectiveAccountId]);
  const handleComposerOpenCategoryPicker = useCallback(
    () => setComposerCategorySheet({ open: true, kind: composerType }),
    [composerType],
  );
  const handleDismissComposerCategorySheet = useCallback(
    () => setComposerCategorySheet((current) => ({ ...current, open: false })),
    [],
  );
  const handlePickComposerCategory = useCallback((next: string) => {
    setComposerCategoryId(next);
    setComposerCategorySheet((current) => ({ ...current, open: false }));
  }, []);
  const handleComposerPayeeChange = useCallback((next: string) => {
    setComposerPayee(next);
  }, []);
  const handleComposerDateChange = useCallback((next: string) => setComposerDate(next), []);
  const handleComposerBusinessChange = useCallback(
    (next: boolean) => setComposerIsBusiness(next),
    [],
  );
  const handleComposerNoteChange = useCallback((next: string) => setComposerNote(next), []);
  const handleComposerCounterpartyChange = useCallback(
    (next: string) => setComposerCounterpartyId(next),
    [],
  );
  const handleComposerCounterpartyRoleChange = useCallback((next: CounterpartyRole) => {
    setComposerCounterpartyRole(next);
  }, []);

  const handleDiscard = useCallback(() => router.back(), []);
  const handleComposerCancel = useCallback(() => {
    // S05 §7: discarding your own typing is cheap to redo; discarding a
    // machine's guess is not — the confirm exists for exactly the one thing
    // the keypad path ever fills on its own.
    if (!accountMachineFilled) {
      router.back();
      return;
    }
    Alert.alert(t("common.discardTitle"), t("common.discardBody"), [
      { text: t("common.cancel"), style: "cancel" },
      { text: t("common.discard"), style: "destructive", onPress: handleDiscard },
    ]);
  }, [accountMachineFilled, handleDiscard, t]);

  // §6.6, never defaulted: a counterparty picked with no role would reach
  // `create_transaction`'s own refine and refuse — Save stays disabled here so
  // the reason is visible on the chip (`counterpartyValue`'s "role?" suffix)
  // before the person ever taps it, not after.
  //
  // §14.6, the same rule: `selectedComposerAccount.capturable === false` is
  // knowable the moment the account chip fills, not only once
  // `create_transaction` bounces it — `QuickAddForm`'s own `blocked` already
  // disables the desk fallback's Save this way; this matches it.
  const composerSaveDisabled =
    parseAmount(composerAmountRaw) === null ||
    effectiveAccountId === null ||
    selectedComposerAccount?.capturable === false ||
    (composerCounterpartyId !== null && composerCounterpartyRole === null);
  const handleComposerSave = useCallback(() => {
    const amount = parseAmount(composerAmountRaw);
    if (amount === null || effectiveAccountId === null) return;
    const next: QuickAddDraft = {
      type: composerType,
      amount,
      accountId: effectiveAccountId,
      categoryId: effectiveCategoryId,
      payee: composerPayee,
      date: composerDate,
      note: composerNote,
      isBusiness: composerIsBusiness,
      counterpartyId: composerCounterpartyId,
      counterpartyRole: composerCounterpartyRole,
    };
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
    effectiveCategoryId,
    composerCounterpartyId,
    composerCounterpartyRole,
    composerDate,
    composerIsBusiness,
    composerNote,
    composerPayee,
    composerType,
    effectiveAccountId,
    ledger,
    selectedComposerAccount,
    t,
  ]);

  const handleMode = useCallback(() => {}, []);
  const modes = useMemo<readonly [DockModeOption, DockModeOption, ...DockModeOption[]]>(
    () => [
      { value: "keypad", label: t("transactions.modeKeypad") },
      { value: "voice", label: t("transactions.modeVoice"), disabled: true },
      { value: "receipt", label: t("transactions.modeReceipt"), disabled: true },
      { value: "converse", label: t("transactions.modeConverse"), disabled: true },
    ],
    [t],
  );

  /* ── The desk fallback's own draft — unchanged from before this PR ──── */
  const [fieldErrorsDesk, setFieldErrorsDesk] = useState<ReturnType<typeof mapFieldErrors>>();
  const handleDeskSave = useCallback(
    (next: QuickAddDraft) => {
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
    [composerAccounts, ledger, t],
  );

  if (breakpoint === "desk") {
    return (
      <GroundPanel>
        {/* No title: the navigation header carries it, and the same
            string twice on one screen reads as two sections. */}
        <Card>
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
            {...(fieldErrorsDesk === undefined ? {} : { fieldErrors: fieldErrorsDesk })}
            onCancel={handleDeskCancel}
            onSave={handleDeskSave}
          />
        </Card>
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
    );
  }

  return (
    <View style={styles.root}>
      {/* `clearBottom={false}` — this panel is not the screen's own bottom
          edge, `Dock` below it is, and `Dock` already clears the home
          indicator itself. */}
      <GroundPanel clearBottom={false}>
        <QuickAddComposer
          raw={composerAmountRaw}
          type={composerType}
          onTypeChange={handleComposerTypeChange}
          accounts={composerAccounts}
          accountId={effectiveAccountId}
          accountMachineFilled={accountMachineFilled}
          onOpenAccountPicker={handleOpenComposerAccountPicker}
          categories={snapshot.categories}
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
          payee={composerPayee}
          onPayeeChange={handleComposerPayeeChange}
          date={composerDate}
          onDateChange={handleComposerDateChange}
          today={today}
          isBusiness={composerIsBusiness}
          onBusinessChange={handleComposerBusinessChange}
          note={composerNote}
          onNoteChange={handleComposerNoteChange}
          counterparties={snapshot.counterparties}
          counterpartyId={composerCounterpartyId}
          onCounterpartyChange={handleComposerCounterpartyChange}
          counterpartyRole={composerCounterpartyRole}
          onCounterpartyRoleChange={handleComposerCounterpartyRoleChange}
          onCreateCounterparty={handleComposerCreateCounterparty}
          {...(fieldErrors === undefined ? {} : { fieldErrors })}
          onCancel={handleComposerCancel}
        />
      </GroundPanel>
      <Dock
        mode="keypad"
        modes={modes}
        onMode={handleMode}
        onSave={handleComposerSave}
        saveLabel={t("common.save")}
        saveDisabled={composerSaveDisabled}
      >
        <Keypad onKey={handleKey} />
      </Dock>
      <CategorySheet
        visible={composerCategorySheet.open}
        kind={composerCategorySheet.kind}
        tree={snapshot.categoryTree}
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
}));
