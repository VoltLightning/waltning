import type { AccountingDate } from "@waltning/core/date";
import type { Id, IdTable } from "@waltning/core/id";
import type { CurrencyCode, Money } from "@waltning/core/money";
import * as money from "@waltning/core/money";
import {
  type AccountKind,
  type CreateAccountInput,
  type CreateTransactionInput,
  createAccountInput,
  createTransactionInput,
} from "@waltning/core/registry/inputs";

export type PhoneCapture = {
  date: AccountingDate;
  timeZone: string;
  offsetMinutes: number;
  at: Date;
};

export type PhoneAccount = {
  id: Id<"accounts">;
  name: string;
  kind: AccountKind;
  currency: CurrencyCode;
  decimals: number;
  balance: Money;
};

export type PhoneRecentTransaction = {
  id: Id<"transactions">;
  date: AccountingDate;
  payee: string;
  categoryName: string | null;
  accountName: string;
  amount: Money;
  currency: CurrencyCode;
  decimals: number;
  isBusiness: boolean;
};

export type PhoneLedgerPort = {
  listAccounts: () => readonly PhoneAccount[];
  listRecent: (limit: number) => readonly PhoneRecentTransaction[];
  createAccount: (input: CreateAccountInput, capture: PhoneCapture) => void;
  createTransaction: (input: CreateTransactionInput, capture: PhoneCapture) => void;
  reset: () => void;
};

export type PhoneLedgerRuntime = {
  capture: () => PhoneCapture;
  id: <Table extends IdTable>() => Id<Table>;
};

export type PhoneLedgerSnapshot = {
  accounts: readonly PhoneAccount[];
  recent: readonly PhoneRecentTransaction[];
  total: Money;
};

export type PhoneLedgerController = {
  getSnapshot: () => PhoneLedgerSnapshot;
  subscribe: (listener: () => void) => () => void;
  refresh: () => void;
  createAccount: (name: string) => Id<"accounts">;
  createExpense: (amount: string, accountId: Id<"accounts">) => Id<"transactions">;
  reset: () => void;
};

export function createPhoneLedger(
  port: PhoneLedgerPort,
  runtime: PhoneLedgerRuntime,
): PhoneLedgerController {
  let snapshot: PhoneLedgerSnapshot = { accounts: [], recent: [], total: money.toMoney("0") };
  const listeners = new Set<() => void>();

  const refresh = () => {
    const accounts = port.listAccounts();
    const nonUsd = accounts.find((account) => account.currency !== "USD");
    if (nonUsd) {
      throw new Error(`phone preview cannot combine non-USD account ${nonUsd.id}`);
    }
    snapshot = {
      accounts,
      recent: port.listRecent(5),
      total: money.sum(accounts.map((account) => account.balance)),
    };
    for (const listener of listeners) listener();
  };

  refresh();

  return {
    getSnapshot: () => snapshot,
    subscribe: (listener) => {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
    refresh,
    createAccount: (name) => {
      const capture = runtime.capture();
      const input = createAccountInput.parse({
        id: runtime.id<"accounts">(),
        name,
        currency: "USD",
      });
      port.createAccount(input, capture);
      refresh();
      return input.id;
    },
    createExpense: (amount, accountId) => {
      const account = snapshot.accounts.find((candidate) => candidate.id === accountId);
      if (!account) throw new Error("Choose an account before saving");

      const normalized = money.toMoney(amount);
      if (money.dec(normalized).lte(0)) {
        throw new Error("Expense amount must be greater than zero");
      }

      const capture = runtime.capture();
      const input = createTransactionInput.parse({
        id: runtime.id<"transactions">(),
        date: capture.date,
        type: "expense",
        accountId,
        amountOriginal: normalized,
        currency: account.currency,
      });
      port.createTransaction(input, capture);
      refresh();
      return input.id;
    },
    reset: () => {
      port.reset();
      refresh();
    },
  };
}
