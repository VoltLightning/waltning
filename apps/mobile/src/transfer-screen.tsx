/**
 * S31 · Transfer — move money between two of your own accounts.
 *
 * `wave-3-shared.md`'s rule: one screen file, composed from `packages/ui`
 * through `useLedgerController()`. This is the one place `readCrossRate` is
 * called and the one place `QuickAddDraft` (widened for `type: "transfer"`,
 * E5) is assembled — `TransferComposer` itself only renders and reports taps.
 *
 * **Mobile only.** S31 §3's web layout — the same fields on one row instead
 * of stacked — is not built here; the desk breakpoint falls through to this
 * same stacked form rather than a second composition, which is a real gap
 * against the spec's own "Web: ≥1024px" row, left for a follow-up the same
 * way `QuickAddForm`'s desk fallback was its own PR.
 */

import { convertAmountRaw } from "@waltning/client/ledger/convert-amount";
import type { PhoneCapturableAccount } from "@waltning/client/ledger/create-phone-ledger";
import { crossRateProvenance } from "@waltning/client/ledger/cross-rate-provenance";
import { deviceRuntime } from "@waltning/client/ledger/device-runtime";
import { parseTransferRoute } from "@waltning/client/ledger/preview-routes";
import { useLedgerController } from "@waltning/client/ledger/use-ledger-controller";
import { usePhoneLedger } from "@waltning/client/ledger/use-phone-ledger";
import { type FieldError, mapFieldErrors } from "@waltning/client/transport/field-errors";
import { accountingDate, isAccountingDate } from "@waltning/core/date";
import * as money from "@waltning/core/money";
import { AccountPicker, type AccountPickerAccount } from "@waltning/ui/accounts/account-picker";
import { parseAmount } from "@waltning/ui/fx/amount-field";
import { useT } from "@waltning/ui/i18n/provider";
import { useSafeArea } from "@waltning/ui/primitives/safe-area";
import { makeStyles } from "@waltning/ui/theme/styles";
import { space } from "@waltning/ui/tokens";
import { applyKey } from "@waltning/ui/transactions/amount-keys";
import { Dock, type DockModeOption } from "@waltning/ui/transactions/dock";
import { Keypad, type KeypadKey } from "@waltning/ui/transactions/keypad";
import {
  TransferComposer,
  type TransferComposerAccount,
  type TransferComposerField,
} from "@waltning/ui/transactions/transfer-composer";
import { router, useLocalSearchParams } from "expo-router";
import { useCallback, useMemo, useState } from "react";
import { View } from "react-native";

/** `create_transaction`'s own field paths for a transfer row — everything else lands at form level. */
const KNOWN_PATHS = ["amountOriginal", "accountId", "toAccountId", "toAmount", "fee", "date"];

/**
 * L — a refusal's own text, resolving the `messageKey`s `createTransaction`
 * can set for a transfer row through `useT()` — it cannot call the hook
 * itself (`packages/client` is not a component). The same two keys
 * `quick-add-screen.tsx`'s own `resolveFieldErrorMessage` resolves for
 * `amountOriginal`; here they can also land on `toAmount` or `fee`
 * (`0012_transaction_scale_and_category_kind.sql`'s extended
 * `assert_amount_scale`), and `accountId` (the *from* leg's own rate guard).
 * Everything else was already `error.message` — the raw English a schema or
 * an executor wrote — never routed through a translation at all.
 */
function resolveFieldErrorMessage(t: ReturnType<typeof useT>, error: FieldError): string {
  if (error.messageKey === "transactions.needsRate") {
    return t("transactions.needsRate", { currency: error.params?.["currency"] ?? "" });
  }
  if (error.messageKey === "transactions.tooManyDecimals") {
    return t("transactions.tooManyDecimals", {
      currency: error.params?.["currency"] ?? "",
      decimals: error.params?.["decimals"] ?? "",
    });
  }
  return error.message;
}

function handleCancel() {
  router.back();
}

function toComposerAccount(account: {
  id: string;
  name: string;
  currency: string;
  decimals: number;
  capturable: boolean;
}): TransferComposerAccount {
  return {
    id: account.id,
    name: account.name,
    currency: account.currency,
    decimals: account.decimals,
    capturable: account.capturable,
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

/**
 * The escape to account creation — unlike `quick-add-screen.tsx`'s, this
 * transfer draft has no restorable route shape yet (`parseNewAccountRoute`
 * only carries `quick-add`'s own amount/account pair), so creating an account
 * mid-transfer lands on the register rather than resuming this draft. A real
 * `returnTo: "transfer"` is future work, not this PR's.
 */
function handleCreateAccountFromTransfer() {
  router.push({ pathname: "/account/new", params: { returnTo: "accounts" } });
}

export default function Transfer() {
  const t = useT();
  const styles = useStyles();
  const insets = useSafeArea();
  const raw = useLocalSearchParams<{ from?: string | string[] }>();
  const routeState = parseTransferRoute(raw);
  const ledger = useLedgerController();
  const snapshot = usePhoneLedger(ledger);
  const capture = deviceRuntime().capture();
  const today = capture.date;

  const accounts = useMemo(() => snapshot.accounts.map(toComposerAccount), [snapshot.accounts]);
  const pickerAccounts = useMemo(() => snapshot.accounts.map(toPickerChoice), [snapshot.accounts]);
  const pickerGroups = useMemo(
    () => snapshot.groups.map((group) => ({ id: group.id, name: group.name })),
    [snapshot.groups],
  );

  const [fromAccountId, setFromAccountId] = useState<string | null>(
    accounts.some((account) => account.id === routeState.from) ? (routeState.from ?? null) : null,
  );
  const [toAccountId, setToAccountId] = useState<string | null>(null);
  const [amountRaw, setAmountRaw] = useState("");
  const [toAmountRaw, setToAmountRaw] = useState("");
  const [toAmountEdited, setToAmountEdited] = useState(false);
  const [activeField, setActiveField] = useState<TransferComposerField>("amount");
  const [feeRaw, setFeeRaw] = useState("");
  const [date, setDate] = useState<string>(today);
  const [note, setNote] = useState("");
  const [fieldErrors, setFieldErrors] = useState<ReturnType<typeof mapFieldErrors>>();

  const fromAccount = accounts.find((account) => account.id === fromAccountId);
  const toAccount = accounts.find((account) => account.id === toAccountId);
  const crossCurrency =
    fromAccount !== undefined &&
    toAccount !== undefined &&
    fromAccount.currency !== toAccount.currency;

  // §6 — the reference rate for this pair and date, or `undefined` offline
  // with nothing held: the destination amount then stays empty and the
  // person types it (S31 §6).
  const referenceRate = useMemo(() => {
    if (!crossCurrency || fromAccount === undefined || toAccount === undefined) return undefined;
    // `date` is `DateField`'s own free-typed text — mid-edit it can be a
    // shape `accountingDate` refuses, and this is a render-path memo, not a
    // save-time refusal.
    if (!isAccountingDate(date)) return undefined;
    const result = ledger.readCrossRate({
      from: money.currencyCode(fromAccount.currency),
      to: money.currencyCode(toAccount.currency),
      date: accountingDate(date),
    });
    if (result === null) return undefined;
    // H2 — `crossRateProvenance` turns the two legs into one honest fact:
    // `source`/`date`/`carriedDays` all describe the *same*, staler leg, and
    // `manual` is its own flag, true whenever either leg is a person's own
    // correction, regardless of which leg is the one shown as stale.
    const provenance = crossRateProvenance(result.legs);
    return {
      rate: result.rate,
      source: provenance.source,
      date: provenance.asOf,
      carriedDays: provenance.carriedDays,
      manual: provenance.manual,
    };
  }, [ledger, crossCurrency, fromAccount, toAccount, date]);

  const handleKey = useCallback(
    (key: KeypadKey) => {
      if (activeField === "amount") {
        const next = applyKey(amountRaw, key, fromAccount?.decimals ?? 2);
        setAmountRaw(next);
        // §3 — pre-filled from the reference rate and left editable; an edit
        // to the destination (`toAmountEdited`) freezes this sync, the same
        // rule S31 §7 states for the interaction.
        if (!toAmountEdited) {
          if (!crossCurrency) {
            setToAmountRaw(next);
          } else if (referenceRate !== undefined) {
            const parsed = parseAmount(next);
            if (parsed !== null) {
              setToAmountRaw(
                convertAmountRaw(parsed, referenceRate.rate, toAccount?.decimals ?? 2),
              );
            }
          }
        }
        return;
      }
      const next = applyKey(toAmountRaw, key, toAccount?.decimals ?? 2);
      setToAmountRaw(next);
      setToAmountEdited(true);
    },
    [
      activeField,
      amountRaw,
      toAmountRaw,
      fromAccount,
      toAccount,
      crossCurrency,
      referenceRate,
      toAmountEdited,
    ],
  );

  // H1 — a destination amount typed (or prefilled) for one currency pair must
  // not survive a change to either leg: same-currency collapses to the
  // source figure (§3), a cross-currency pair with a reference re-prefills
  // from it, and one with no reference held offline clears rather than
  // showing a stale conversion for a currency that no longer matches.
  const computeToAmountPrefill = useCallback(
    (nextFromId: string | null, nextToId: string | null): string => {
      const nextFrom = accounts.find((account) => account.id === nextFromId);
      const nextTo = accounts.find((account) => account.id === nextToId);
      if (nextFrom === undefined || nextTo === undefined) return "";
      if (nextFrom.currency === nextTo.currency) return amountRaw;
      if (!isAccountingDate(date)) return "";
      const result = ledger.readCrossRate({
        from: money.currencyCode(nextFrom.currency),
        to: money.currencyCode(nextTo.currency),
        date: accountingDate(date),
      });
      if (result === null) return "";
      const parsed = parseAmount(amountRaw);
      if (parsed === null) return "";
      return convertAmountRaw(parsed, result.rate, nextTo.decimals);
    },
    [accounts, amountRaw, date, ledger],
  );

  // H1 — a typed destination must not be discarded by a currency-preserving
  // account change: switching *From* (or *To*) to another account in the
  // same currency leaves the pair itself unchanged, so the figure (and
  // `toAmountEdited`) a person already typed stays exactly as it was. Only a
  // change to the currency actually on one side re-triggers the prefill
  // above.
  const handleFromAccountChange = useCallback(
    (id: string) => {
      const nextFrom = accounts.find((account) => account.id === id);
      setFromAccountId(id);
      if (nextFrom?.currency === fromAccount?.currency) return;
      setToAmountEdited(false);
      setToAmountRaw(computeToAmountPrefill(id, toAccountId));
    },
    [accounts, computeToAmountPrefill, fromAccount, toAccountId],
  );
  const handleToAccountChange = useCallback(
    (id: string) => {
      const nextTo = accounts.find((account) => account.id === id);
      setToAccountId(id);
      if (nextTo?.currency === toAccount?.currency) return;
      setToAmountEdited(false);
      setToAmountRaw(computeToAmountPrefill(fromAccountId, id));
    },
    [accounts, computeToAmountPrefill, toAccount, fromAccountId],
  );

  /**
   * `AccountPicker` (`accounts/`) is a sibling domain — the same rule
   * `QuickAddComposer` already keeps for `CategorySheet`. One sheet, two legs:
   * `accountPicker.field` says which leg is currently open.
   */
  const [accountPicker, setAccountPicker] = useState<{ open: boolean; field: "from" | "to" }>({
    open: false,
    field: "from",
  });
  const handleOpenFromAccountPicker = useCallback(
    () => setAccountPicker({ open: true, field: "from" }),
    [],
  );
  const handleOpenToAccountPicker = useCallback(
    () => setAccountPicker({ open: true, field: "to" }),
    [],
  );
  const handleDismissAccountPicker = useCallback(
    () => setAccountPicker((current) => ({ ...current, open: false })),
    [],
  );
  const handlePickAccount = useCallback(
    (id: string) => {
      if (accountPicker.field === "from") handleFromAccountChange(id);
      else handleToAccountChange(id);
      setAccountPicker((current) => ({ ...current, open: false }));
    },
    [accountPicker.field, handleFromAccountChange, handleToAccountChange],
  );

  const handleSwap = useCallback(() => {
    setFromAccountId(toAccountId);
    setToAccountId(fromAccountId);
    setAmountRaw(toAmountRaw);
    setToAmountRaw(amountRaw);
    // Both sides already hold a person's own figure once swapped — neither
    // is a rate-derived estimate any more.
    setToAmountEdited(true);
  }, [fromAccountId, toAccountId, amountRaw, toAmountRaw]);

  const sameAccount = fromAccountId !== null && fromAccountId === toAccountId;
  const parsedAmount = parseAmount(amountRaw);
  const parsedToAmount = parseAmount(toAmountRaw);
  // H3 — a zero destination (or source) amount is a transfer that moves
  // nothing; `dec(…).isZero()` catches "0", "0,00" and the like the same way
  // `TransferComposer`'s own margin guard already does, before the write
  // ever reaches `createTransactionInput`'s refine or the CHECK. `dec` here,
  // not the `Money` constructor — `architecture.test.ts` bans that call
  // outside `packages/ui` (render figures through `<Amount>`, never format
  // them by hand), and this is a save-gate check, not a render.
  const amountIsZero = parsedAmount !== null && money.dec(parsedAmount).isZero();
  const toAmountIsZero = parsedToAmount !== null && money.dec(parsedToAmount).isZero();
  // C2 — a fee that has been typed but does not yet parse (a stray letter,
  // or `parseAmount`'s own "trailing separator" rejection — typing "1," on
  // its way to "1,50" parses to `null` until a digit follows the comma) must
  // not be silently dropped from the write; Save stays disabled — correctly,
  // mid-keystroke — until it is either finished or cleared.
  const feeUnparsable = feeRaw !== "" && parseAmount(feeRaw) === null;
  // §14.6 — refused before the write on an uncapturable *From* account; Save
  // stays disabled the same way it already does for every other refusal this
  // screen can see coming, rather than letting a tap reach the controller
  // only to bounce.
  const saveDisabled =
    parsedAmount === null ||
    fromAccountId === null ||
    toAccountId === null ||
    sameAccount ||
    parsedToAmount === null ||
    amountIsZero ||
    toAmountIsZero ||
    feeUnparsable ||
    fromAccount?.capturable === false;

  const handleSave = useCallback(() => {
    if (parsedAmount === null || fromAccountId === null || toAccountId === null) return;
    if (parsedToAmount === null || toAccount === undefined) return;
    // M4 — closes the source leg the same way `saveDisabled` already does:
    // a zero either side is refused here too, not only by the button's own
    // disabled state, so a stray `handleSave` call can never reach the write.
    if (amountIsZero || toAmountIsZero) return;
    const parsedFee = parseAmount(feeRaw);
    // H3 — a typed `0`/`0,00` fee is the same as no fee at all: dropped here
    // rather than sent as a zero the contract's `> 0` refine would then
    // refuse.
    const feeIsZero = parsedFee !== null && money.dec(parsedFee).isZero();

    const result = ledger.createTransaction({
      type: "transfer",
      amount: parsedAmount,
      accountId: fromAccountId,
      categoryId: null,
      date,
      note,
      isBusiness: false,
      counterpartyId: null,
      counterpartyRole: null,
      toAccountId,
      toAmount: parsedToAmount,
      toCurrency: toAccount.currency,
      ...(parsedFee === null || feeIsZero ? {} : { fee: parsedFee }),
    });
    if (!("id" in result)) {
      const resolved = result.fieldErrors.map((error) => ({
        path: error.path,
        message: resolveFieldErrorMessage(t, error),
      }));
      setFieldErrors(mapFieldErrors(resolved, KNOWN_PATHS));
      return;
    }
    setFieldErrors(undefined);
    router.dismissTo("/");
  }, [
    parsedAmount,
    parsedToAmount,
    amountIsZero,
    toAmountIsZero,
    fromAccountId,
    toAccountId,
    toAccount,
    feeRaw,
    date,
    note,
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

  // Computed rather than in the stylesheet: the inset is per-device, the same
  // reason `quick-add-screen.tsx`'s own `horizontalInsets` is.
  const horizontalInsets = {
    paddingLeft: space.x5 + insets.left,
    paddingRight: space.x5 + insets.right,
  };

  return (
    <View style={styles.root}>
      <View style={[styles.scroll, horizontalInsets]}>
        <TransferComposer
          accounts={accounts}
          fromAccountId={fromAccountId}
          onOpenFromAccountPicker={handleOpenFromAccountPicker}
          toAccountId={toAccountId}
          onOpenToAccountPicker={handleOpenToAccountPicker}
          onSwap={handleSwap}
          amountRaw={amountRaw}
          toAmountRaw={toAmountRaw}
          activeField={activeField}
          onActiveFieldChange={setActiveField}
          {...(referenceRate ? { referenceRate } : {})}
          fee={feeRaw}
          onFeeChange={setFeeRaw}
          date={date}
          onDateChange={setDate}
          today={today}
          note={note}
          onNoteChange={setNote}
          {...(fieldErrors === undefined ? {} : { fieldErrors })}
          onCancel={handleCancel}
        />
      </View>
      <Dock
        mode="keypad"
        modes={modes}
        onMode={handleMode}
        onSave={handleSave}
        saveLabel={t("common.save")}
        saveDisabled={saveDisabled}
      >
        <Keypad onKey={handleKey} />
      </Dock>
      <AccountPicker
        visible={accountPicker.open}
        accounts={pickerAccounts}
        groups={pickerGroups}
        accountId={accountPicker.field === "from" ? fromAccountId : toAccountId}
        onPick={handlePickAccount}
        onCreateAccount={handleCreateAccountFromTransfer}
        onDismiss={handleDismissAccountPicker}
      />
    </View>
  );
}

const useStyles = makeStyles((theme) => ({
  root: { flex: 1, backgroundColor: theme.ground },
  scroll: { flex: 1, paddingTop: space.x5, gap: space.x4 },
}));
