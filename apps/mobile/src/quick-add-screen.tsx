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
import type { FieldError } from "@waltning/client/transport/field-errors";
import { mapFieldErrors } from "@waltning/client/transport/field-errors";
import { fold } from "@waltning/core/capture/names";
import { proposeCategory } from "@waltning/core/capture/payee-memory";
import { AccountPicker, type AccountPickerAccount } from "@waltning/ui/accounts/account-picker";
import { CategorySheet } from "@waltning/ui/categories/category-sheet";
import { parseAmount } from "@waltning/ui/fx/amount-field";
import { useT } from "@waltning/ui/i18n/provider";
import { useSafeArea } from "@waltning/ui/primitives/safe-area";
import { useBreakpoint } from "@waltning/ui/primitives/use-breakpoint";
import { Card, GroundPanel } from "@waltning/ui/shell/card";
import { makeStyles } from "@waltning/ui/theme/styles";
import { space } from "@waltning/ui/tokens";
import { applyKey } from "@waltning/ui/transactions/amount-keys";
import { Dock, type DockModeOption } from "@waltning/ui/transactions/dock";
import { Keypad, type KeypadKey } from "@waltning/ui/transactions/keypad";
import {
  QuickAddComposer,
  type QuickAddComposerAccount,
} from "@waltning/ui/transactions/quick-add-composer";
import { type QuickAddAccount, QuickAddForm } from "@waltning/ui/transactions/quick-add-form";
import { router, useLocalSearchParams } from "expo-router";
import { useCallback, useMemo, useState } from "react";
import { Alert, View } from "react-native";
import { lastCapture, saveHaptic } from "./platform";

type CreateAccountEscapeDraft = { amount: string; accountId: string | null };
type CounterpartyRole = "debt" | "contribution" | "reference";

/** `create_transaction`'s own field paths — everything else lands at form level. */
const KNOWN_PATHS = [
  "amountOriginal",
  "accountId",
  "categoryId",
  "payee",
  "date",
  "note",
  "isBusiness",
  "counterpartyId",
  "counterpartyRole",
];

/**
 * A refusal's own text, resolving the one `messageKey` the controller sets
 * (`transactions.needsRate`, on an uncapturable account) through `useT()` —
 * it cannot call the hook itself (`packages/client` is not a component).
 */
function resolveFieldErrorMessage(t: ReturnType<typeof useT>, error: FieldError): string {
  if (error.messageKey === "transactions.needsRate") {
    return t("transactions.needsRate", { currency: error.params?.["currency"] ?? "" });
  }
  if (error.messageKey === "transactions.sharedNeverBusiness") {
    return t("transactions.sharedNeverBusiness");
  }
  return error.message;
}

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
  const insets = useSafeArea();
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
  const [composerPayee, setComposerPayee] = useState("");
  const [composerDate, setComposerDate] = useState<string>(today);
  const [composerNote, setComposerNote] = useState("");
  const [composerIsBusiness, setComposerIsBusiness] = useState(false);
  const [composerCounterpartyId, setComposerCounterpartyId] = useState<string | null>(null);
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
  const handleComposerAccountChange = useCallback(
    (next: string) => {
      setComposerAccountId(next);
      const account = composerAccounts.find((candidate) => candidate.id === next);
      if (account?.ownership === "shared") setComposerIsBusiness(false);
    },
    [composerAccounts],
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
  const handleComposerPayeeChange = useCallback((next: string) => setComposerPayee(next), []);
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
      categoryId: composerCategoryId,
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
    router.dismissTo("/");
  }, [
    composerAmountRaw,
    composerCategoryId,
    composerCounterpartyId,
    composerCounterpartyRole,
    composerDate,
    composerIsBusiness,
    composerNote,
    composerPayee,
    composerType,
    effectiveAccountId,
    ledger,
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
      router.dismissTo("/");
    },
    [ledger, t],
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

  // Computed rather than in the stylesheet: the inset is per-device, the same
  // reason `dock.tsx`'s own `clearance` is computed beside its `useStyles` call
  // rather than folded into it.
  const horizontalInsets = {
    paddingLeft: space.x5 + insets.left,
    paddingRight: space.x5 + insets.right,
  };

  return (
    <View style={styles.root}>
      <View style={[styles.scroll, horizontalInsets]}>
        <QuickAddComposer
          raw={composerAmountRaw}
          type={composerType}
          onTypeChange={handleComposerTypeChange}
          accounts={composerAccounts}
          accountId={effectiveAccountId}
          accountMachineFilled={accountMachineFilled}
          onOpenAccountPicker={handleOpenComposerAccountPicker}
          categories={snapshot.categories}
          categoryId={composerCategoryId}
          {...(categoryProposal === undefined ? {} : { categoryProposal })}
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
          {...(fieldErrors === undefined ? {} : { fieldErrors })}
          onCancel={handleComposerCancel}
        />
      </View>
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
  // Only left/right/top are cleared here — the bottom inset belongs to
  // `Dock`, the one component below that actually meets a home indicator
  // (`dock.tsx`'s own comment: "each component clearing only the edge it
  // actually touches").
  scroll: { flex: 1, paddingTop: space.x5, gap: space.x4 },
}));
