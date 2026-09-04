/**
 * S16 · Accounts — the register. Reached from Today's balances and Settings,
 * never a tab (S04 §2) — a stack screen pushed the same way `account/new` is.
 */

import type { PhoneAccount } from "@waltning/client/ledger/create-phone-ledger";
import { useLedgerController } from "@waltning/client/ledger/use-ledger-controller";
import { usePhoneLedger } from "@waltning/client/ledger/use-phone-ledger";
import {
  AccountRegister,
  type AccountRegisterAccount,
} from "@waltning/ui/accounts/account-register";
import { GroundPanel } from "@waltning/ui/shell/card";
import { Toast } from "@waltning/ui/states/toast";
import { router, useLocalSearchParams } from "expo-router";
import { useCallback, useRef, useState } from "react";

function handleCreateAccount() {
  router.push({ pathname: "/account/new", params: { returnTo: "accounts" } });
}

/** S16 §7's row action — opens S31 with this row's own account pre-picked. */
function handleTransferFrom(id: string) {
  router.push({ pathname: "/transfer", params: { from: id } });
}

/** The ledger's own row onto the register's — the one place the two field sets meet. */
function toRegisterAccount(account: PhoneAccount): AccountRegisterAccount {
  return {
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
  // `archive_account` has no undo (the shared wave-3 plan says why — no
  // `restore_*` operation exists), so this is a plain `Toast`, not `UndoToast`.
  const { message } = useLocalSearchParams<{ message?: string }>();
  const [toast, setToast] = useState<string | null>(message ?? null);
  // Shown at most once — straight from the route param's initial value,
  // never re-set — so a single token (`useTimer`/`useToastMotion`'s
  // `resetKey`, H1) is all a re-arm could ever need here.
  const toastToken = useRef(1).current;

  const handleSelectAccount = useCallback((id: string) => {
    router.push(`/accounts/${id}`);
  }, []);
  const handleLoadArchived = useCallback(() => ledger.loadArchived(), [ledger]);
  const handleDismissToast = useCallback(() => setToast(null), []);

  return (
    <GroundPanel>
      <AccountRegister
        accounts={snapshot.accounts.map(toRegisterAccount)}
        archivedAccounts={snapshot.archivedAccounts.map(toRegisterAccount)}
        onSelectAccount={handleSelectAccount}
        onLoadArchived={handleLoadArchived}
        onCreateAccount={handleCreateAccount}
        onTransferFrom={handleTransferFrom}
      />
      {toast === null ? null : (
        <Toast message={toast} onDismiss={handleDismissToast} token={toastToken} />
      )}
    </GroundPanel>
  );
}
