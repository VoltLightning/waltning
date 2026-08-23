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
import { type ClientDiagnostics, clientFailure, emitClientDiagnostic } from "../diagnostics.ts";

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
  diagnostics?: ClientDiagnostics;
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
  const { diagnostics } = runtime;

  const refresh = () => {
    emitClientDiagnostic(diagnostics, {
      scope: "client_state",
      update: "phone_ledger_refresh",
      phase: "start",
    });
    try {
      const accounts = port.listAccounts();
      const nonUsd = accounts.find((account) => account.currency !== "USD");
      if (nonUsd) {
        throw new Error("phone preview cannot combine non-USD accounts");
      }
      snapshot = {
        accounts,
        recent: port.listRecent(5),
        total: money.sum(accounts.map((account) => account.balance)),
      };
      for (const listener of listeners) listener();
      emitClientDiagnostic(diagnostics, {
        scope: "client_state",
        update: "phone_ledger_refresh",
        phase: "success",
      });
    } catch (error) {
      emitClientDiagnostic(diagnostics, {
        scope: "client_state",
        update: "phone_ledger_refresh",
        phase: "failure",
        error: clientFailure(error),
      });
      throw error;
    }
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
      emitClientDiagnostic(diagnostics, {
        scope: "client_action",
        action: "create_account",
        phase: "start",
      });
      try {
        const capture = runtime.capture();
        const input = createAccountInput.parse({
          id: runtime.id<"accounts">(),
          name,
          currency: "USD",
        });
        port.createAccount(input, capture);
        refresh();
        emitClientDiagnostic(diagnostics, {
          scope: "client_action",
          action: "create_account",
          phase: "success",
        });
        return input.id;
      } catch (error) {
        emitClientDiagnostic(diagnostics, {
          scope: "client_action",
          action: "create_account",
          phase: "failure",
          error: clientFailure(error),
        });
        throw error;
      }
    },
    createExpense: (amount, accountId) => {
      emitClientDiagnostic(diagnostics, {
        scope: "client_action",
        action: "create_expense",
        phase: "start",
      });
      try {
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
        emitClientDiagnostic(diagnostics, {
          scope: "client_action",
          action: "create_expense",
          phase: "success",
        });
        return input.id;
      } catch (error) {
        emitClientDiagnostic(diagnostics, {
          scope: "client_action",
          action: "create_expense",
          phase: "failure",
          error: clientFailure(error),
        });
        throw error;
      }
    },
    reset: () => {
      emitClientDiagnostic(diagnostics, {
        scope: "client_action",
        action: "reset_preview",
        phase: "start",
      });
      try {
        port.reset();
        refresh();
        emitClientDiagnostic(diagnostics, {
          scope: "client_action",
          action: "reset_preview",
          phase: "success",
        });
      } catch (error) {
        emitClientDiagnostic(diagnostics, {
          scope: "client_action",
          action: "reset_preview",
          phase: "failure",
          error: clientFailure(error),
        });
        throw error;
      }
    },
  };
}
