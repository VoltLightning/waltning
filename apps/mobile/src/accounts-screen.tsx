/**
 * S16 · Accounts — the register, and the bar's second tab (`05-composites`,
 * `TabBar`). Also reached from Today's net-worth line and from Settings.
 */

import type {
  PhoneAccount,
  PhoneCurrency,
  PhoneLedgerController,
} from "@waltning/client/ledger/create-phone-ledger";
import { useLedgerController } from "@waltning/client/ledger/use-ledger-controller";
import { usePhoneLedger } from "@waltning/client/ledger/use-phone-ledger";
import { type AccountingDate, todayIn } from "@waltning/core/date";
import * as money from "@waltning/core/money";
import {
  AccountRegister,
  type AccountRegisterAccount,
} from "@waltning/ui/accounts/account-register";
import { GroundPanel } from "@waltning/ui/shell/card";
import { Toast } from "@waltning/ui/states/toast";
import { router, useLocalSearchParams } from "expo-router";
import { useCallback, useMemo, useState } from "react";

function handleCreateAccount() {
  router.push({ pathname: "/account/new", params: { returnTo: "accounts" } });
}

/** S16 §7's row action — opens S31 with this row's own account pre-picked. */
function handleTransferFrom(id: string) {
  router.push({ pathname: "/transfer", params: { from: id } });
}

/**
 * The balance in the pivot, for an account held in anything else (S16 §3's
 * `62,40 Br · 0,3121 → 19,48 zł`), from the rate for today — carried forward,
 * or set by hand, and saying which. `undefined` where there is no rate at all:
 * no figure is better than a guessed one.
 */
function conversionOf(
  ledger: PhoneLedgerController,
  account: PhoneAccount,
  pivot: PhoneCurrency | undefined,
  today: AccountingDate,
): AccountRegisterAccount["conversion"] {
  if (pivot === undefined || account.currency === pivot.code) return undefined;
  const held = ledger.readRate({ base: pivot.code, quote: account.currency, date: today });
  if (held === null) return undefined;
  return {
    rate: money.reciprocal(held.rate),
    displayCurrency: pivot.symbol ?? pivot.code,
    displayDecimals: pivot.decimals,
    provenance:
      held.source === "manual"
        ? { kind: "override" }
        : held.carriedDays > 0
          ? { kind: "estimated" }
          : { kind: "synced" },
  };
}

/**
 * This account's balance in the display currency — what the register totals.
 *
 * **`undefined` where there is no rate**, and then the account is simply not
 * in any total. S16 §3 would rather state a figure over nine of ten accounts
 * and say which nine than fold in a tenth at a rate nobody has.
 */
function pivotBalanceOf(
  account: PhoneAccount,
  pivot: PhoneCurrency | undefined,
  conversion: AccountRegisterAccount["conversion"],
): money.Money | undefined {
  if (pivot === undefined) return undefined;
  if (account.currency === pivot.code) return account.balance;
  if (conversion === undefined) return undefined;
  return money.toPivot(account.balance, conversion.rate);
}

/** The ledger's own row onto the register's — the one place the two field sets meet. */
function toRegisterAccount(
  account: PhoneAccount,
  conversion: AccountRegisterAccount["conversion"],
  pivotBalance: money.Money | undefined,
): AccountRegisterAccount {
  return {
    ...(conversion === undefined ? {} : { conversion }),
    ...(pivotBalance === undefined ? {} : { pivotBalance }),
    id: account.id,
    name: account.name,
    kind: account.kind,
    ownership: account.ownership,
    balance: account.balance,
    currency: account.currency,
    decimals: account.decimals,
    isBusiness: account.isBusiness,
    expectedBalance: account.expectedBalance,
  };
}

export default function Accounts() {
  const ledger = useLedgerController();
  const snapshot = usePhoneLedger(ledger);
  const pivot = snapshot.currencies.find((currency) => currency.isPivot);
  const today = todayIn(Intl.DateTimeFormat().resolvedOptions().timeZone);
  const accounts = useMemo(
    () =>
      snapshot.accounts.map((account) => {
        const conversion = conversionOf(ledger, account, pivot, today);
        return toRegisterAccount(account, conversion, pivotBalanceOf(account, pivot, conversion));
      }),
    [snapshot.accounts, ledger, pivot, today],
  );
  const archivedAccounts = useMemo(
    () =>
      snapshot.archivedAccounts.map((account) => toRegisterAccount(account, undefined, undefined)),
    [snapshot.archivedAccounts],
  );
  // The register's own total is stated in the pivot or not at all — a sum over
  // figures in three currencies is not a number.
  const registerPivot = useMemo(
    () => (pivot === undefined ? undefined : { currency: pivot.code, decimals: pivot.decimals }),
    [pivot],
  );
  // `archive_account` has no undo (the shared wave-3 plan says why — no
  // `restore_*` operation exists), so this is a plain `Toast`, not `UndoToast`.
  // The screen can stay mounted across two archives in a row
  // (`account-editor-screen.tsx`'s `dismissTo`), so `message` has to be read
  // on every arrival, not once at mount — and `nonce` (that same push's own
  // `Date.now()`) is what tells a genuinely new arrival apart from a
  // re-render, even when the message text repeats. Both updates happen
  // during render — the endorsed pattern for adjusting state from a changed
  // prop — so the new toast is already showing by the time this render
  // commits.
  const { message, nonce } = useLocalSearchParams<{ message?: string; nonce?: string }>();
  const [lastNonce, setLastNonce] = useState(nonce);
  const [toast, setToast] = useState<string | null>(message ?? null);
  const [toastToken, setToastToken] = useState(1);
  if (nonce !== lastNonce) {
    setLastNonce(nonce);
    setToast(message ?? null);
    setToastToken((token) => token + 1);
  }

  /** S16 §3 — the whole ordered list, straight through to `reorder_accounts`. */
  const handleReorder = useCallback(
    (ids: readonly string[]) => {
      ledger.reorderAccounts(ids);
    },
    [ledger],
  );

  /**
   * S16 §2 — **tapping an account is a filter, not a screen.** The register
   * answers *what exists and what is in it*; *what happened in it* is the
   * ledger with one clause added, and Home is that list. A third list of the
   * same rows, reachable only from here, would be S10's phone layout invented
   * twice.
   *
   * The editor is where the rest of the row's management already is: behind
   * *Edit*, beside the move controls (§7).
   */
  const handleSelectAccount = useCallback((id: string) => {
    router.push({ pathname: "/", params: { account: id } });
  }, []);
  const handleEditAccount = useCallback((id: string) => {
    router.push(`/accounts/${id}`);
  }, []);
  /**
   * S16 §6's lazy load, and the flag that says it happened. The register
   * cannot tell an empty result from an unread one, and the difference is
   * the difference between *no archived accounts* and *not looked yet* —
   * `loadArchived()` is synchronous today (`create-phone-ledger.ts` sets a
   * flag and refolds), so this commits in the same render; a loader that
   * ever stops being synchronous sets it where it resolves instead.
   */
  const [archivedLoaded, setArchivedLoaded] = useState(false);
  const handleLoadArchived = useCallback(() => {
    ledger.loadArchived();
    setArchivedLoaded(true);
  }, [ledger]);
  const handleDismissToast = useCallback(() => setToast(null), []);

  return (
    // A tab root: the shell draws the title and the line under it, and there
    // is nowhere to go back to.
    <GroundPanel>
      <AccountRegister
        accounts={accounts}
        archivedAccounts={archivedAccounts}
        archivedLoaded={archivedLoaded}
        onSelectAccount={handleSelectAccount}
        onLoadArchived={handleLoadArchived}
        onCreateAccount={handleCreateAccount}
        onReorder={handleReorder}
        onEditAccount={handleEditAccount}
        onTransferFrom={handleTransferFrom}
        {...(registerPivot === undefined ? {} : { pivot: registerPivot })}
      />
      {toast === null ? null : (
        <Toast message={toast} onDismiss={handleDismissToast} token={toastToken} />
      )}
    </GroundPanel>
  );
}
