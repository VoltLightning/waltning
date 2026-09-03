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
import { type FieldError, fieldErrorsFromZod } from "../transport/field-errors.ts";

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

/**
 * An account, plus whether an expense can be captured against it.
 *
 * The join is here rather than on the screen because it is a rule, not a
 * rendering: `createExpense` refuses the same accounts this marks, and a screen
 * that worked the pairing out itself could disagree with the controller that
 * enforces it.
 */
export type PhoneCapturableAccount = PhoneAccount & {
  capturable: boolean;
};

/**
 * A currency the replica holds, for a picker to offer.
 *
 * Structural rather than imported from `@waltning/ledger`: the port is what
 * keeps this package free of the storage engine behind it, and a type import
 * would be the first thread of the dependency it exists to avoid.
 */
export type PhoneCurrency = {
  code: CurrencyCode;
  name: string;
  symbol: string;
  decimals: number;
  /**
   * Whether a capture in this currency can be valued without a rate being
   * asserted. `false` for any non-pivot currency the replica has no rate for —
   * the ordinary state of a phone that has never synced (§14.6).
   */
  capturable: boolean;
};

/**
 * A group the replica holds, for the create-account form's group picker.
 *
 * Structural rather than imported from `@waltning/ledger`, matching
 * `PhoneCurrency` above — the port is what keeps this package free of the
 * storage engine behind it.
 */
export type PhoneGroup = {
  id: Id<"accountGroups">;
  name: string;
  institution: string | null;
  sort: number;
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

/**
 * A leaf category the quick-add form can offer.
 *
 * Structural, like `PhoneCurrency` above — `kind` names the two draft types a
 * category can attach to (`transactions_category_shape`) without importing
 * the schema package's own enum.
 */
export type PhoneCategory = {
  id: Id<"categories">;
  name: string;
  kind: "income" | "expense";
};

/**
 * A counterparty the quick-add form can attach a role to (§6.6).
 *
 * `#e3` has not shipped a write path yet, so this list is ordinarily empty —
 * the form offers the field only when it is not (S05 §5).
 */
export type PhoneCounterparty = {
  id: Id<"counterparties">;
  name: string;
};

export type PhoneLedgerPort = {
  listAccounts: () => readonly PhoneAccount[];
  listCurrencies: () => readonly PhoneCurrency[];
  listGroups: () => readonly PhoneGroup[];
  listRecent: (limit: number) => readonly PhoneRecentTransaction[];
  listCategories: () => readonly PhoneCategory[];
  listCounterparties: () => readonly PhoneCounterparty[];
  createAccount: (input: CreateAccountInput, capture: PhoneCapture) => void;
  createTransaction: (input: CreateTransactionInput, capture: PhoneCapture) => void;
  reset: () => void;
};

export type PhoneLedgerRuntime = {
  capture: () => PhoneCapture;
  id: <Table extends IdTable>() => Id<Table>;
  diagnostics?: ClientDiagnostics;
};

/**
 * One currency's balance across every account held in it.
 *
 * **Not a total, and there is no total.** Adding a złoty balance to a dollar one
 * needs a rate, and until `#e3` there is no rate table for that number to be
 * wrong against — inventing one here is H21 with nothing to check it. The
 * screen shows a subtotal per currency, each at its own scale, and the reader
 * does the only comparison anyone can honestly do.
 */
export type PhoneCurrencySubtotal = {
  currency: CurrencyCode;
  decimals: number;
  balance: Money;
};

export type PhoneLedgerSnapshot = {
  accounts: readonly PhoneCapturableAccount[];
  currencies: readonly PhoneCurrency[];
  groups: readonly PhoneGroup[];
  recent: readonly PhoneRecentTransaction[];
  categories: readonly PhoneCategory[];
  counterparties: readonly PhoneCounterparty[];
  /**
   * Ordered by the account list, so the currency of your first account leads.
   *
   * Deliberately **not** ordered by size. `12400` is a bigger number than `840`
   * and that says nothing about which holding is larger; ranking currencies by
   * their raw figures is a comparison the app cannot make, printed as though it
   * had.
   */
  subtotals: readonly PhoneCurrencySubtotal[];
};

/**
 * Every field the quick-add screen can save, plain-string ids and all.
 *
 * **The user-owned subset of `CreateTransactionInput`.** Everything else on
 * that schema is either a transfer field (Quick add never offers a transfer —
 * `+` long-press does) or resolved by the server (`fxRate`, `source`, …). Ids
 * stay `string` rather than `Id<Table>` on purpose: this is the shape a form
 * hands back, and `createTransactionInput.parse` inside the controller is
 * where the brand and the format are actually checked — a screen that
 * pre-branded them would be asserting a claim it cannot verify.
 */
export type QuickAddDraft = {
  type: "expense" | "income";
  amount: string;
  accountId: string;
  categoryId: string | null;
  /** `AccountingDate`'s shape (`YYYY-MM-DD`), defaulted by the form to today. */
  date: string;
  note: string;
  isBusiness: boolean;
  counterpartyId: string | null;
  counterpartyRole: "debt" | "contribution" | "reference" | null;
};

export type PhoneLedgerController = {
  getSnapshot: () => PhoneLedgerSnapshot;
  subscribe: (listener: () => void) => () => void;
  refresh: () => void;
  createAccount: (
    name: string,
    currency: CurrencyCode,
  ) => { id: Id<"accounts"> } | { fieldErrors: readonly FieldError[] };
  createTransaction: (
    draft: QuickAddDraft,
  ) => { id: Id<"transactions"> } | { fieldErrors: readonly FieldError[] };
  reset: () => void;
};

/**
 * Balances folded per currency, in the order the accounts arrive.
 *
 * `money.add` rather than `money.sum` over a filtered list: the accumulator is
 * built in one pass, and a currency's first account establishes both its place
 * in the order and its `decimals`.
 */
function subtotalsOf(accounts: readonly PhoneAccount[]): readonly PhoneCurrencySubtotal[] {
  const byCurrency = new Map<CurrencyCode, PhoneCurrencySubtotal>();

  for (const account of accounts) {
    const running = byCurrency.get(account.currency);
    byCurrency.set(
      account.currency,
      running === undefined
        ? { currency: account.currency, decimals: account.decimals, balance: account.balance }
        : { ...running, balance: money.add(running.balance, account.balance) },
    );
  }

  return [...byCurrency.values()];
}

export function createPhoneLedger(
  port: PhoneLedgerPort,
  runtime: PhoneLedgerRuntime,
): PhoneLedgerController {
  let snapshot: PhoneLedgerSnapshot = {
    accounts: [],
    currencies: [],
    groups: [],
    recent: [],
    categories: [],
    counterparties: [],
    subtotals: [],
  };
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
      const currencies = port.listCurrencies();
      const capturable = new Set(
        currencies.filter((currency) => currency.capturable).map((currency) => currency.code),
      );
      snapshot = {
        accounts: accounts.map((account) => ({
          ...account,
          capturable: capturable.has(account.currency),
        })),
        currencies,
        groups: port.listGroups(),
        recent: port.listRecent(5),
        categories: port.listCategories(),
        counterparties: port.listCounterparties(),
        subtotals: subtotalsOf(accounts),
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
    createAccount: (name, currency) => {
      emitClientDiagnostic(diagnostics, {
        scope: "client_action",
        action: "create_account",
        phase: "start",
      });
      try {
        const capture = runtime.capture();
        const parsed = createAccountInput.safeParse({
          id: runtime.id<"accounts">(),
          name,
          currency,
        });
        if (!parsed.success) {
          emitClientDiagnostic(diagnostics, {
            scope: "client_action",
            action: "create_account",
            phase: "success",
          });
          return { fieldErrors: fieldErrorsFromZod(parsed.error) ?? [] };
        }
        port.createAccount(parsed.data, capture);
        refresh();
        emitClientDiagnostic(diagnostics, {
          scope: "client_action",
          action: "create_account",
          phase: "success",
        });
        return { id: parsed.data.id };
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
    createTransaction: (draft) => {
      emitClientDiagnostic(diagnostics, {
        scope: "client_action",
        action: "create_transaction",
        phase: "start",
      });
      try {
        const account = snapshot.accounts.find((candidate) => candidate.id === draft.accountId);
        if (!account) {
          emitClientDiagnostic(diagnostics, {
            scope: "client_action",
            action: "create_transaction",
            phase: "success",
          });
          return {
            fieldErrors: [{ path: "accountId", message: "Choose an account before saving" }],
          };
        }

        /**
         * **Refused here, so it cannot throw from inside the write.**
         *
         * `provisionalFxRate` already refuses this — every row carries a pivot
         * valuation and there is no rate to compute one from — but it refuses
         * mid-transaction, after the outbox entry has been committed, with a
         * message written for a sync log rather than for a person. On a phone
         * with no backend that entry drains nowhere, so the capture becomes an
         * invisible row. Declining first is the difference between "not yet"
         * and a silent loss.
         */
        if (!account.capturable) {
          emitClientDiagnostic(diagnostics, {
            scope: "client_action",
            action: "create_transaction",
            phase: "success",
          });
          return {
            fieldErrors: [
              {
                path: "accountId",
                message: `${account.currency} needs an exchange rate before a transaction can be recorded in it`,
                messageKey: "transactions.needsRate",
                params: { currency: account.currency },
              },
            ],
          };
        }

        const normalized = money.toMoney(draft.amount);
        if (money.dec(normalized).lte(0)) {
          emitClientDiagnostic(diagnostics, {
            scope: "client_action",
            action: "create_transaction",
            phase: "success",
          });
          return {
            fieldErrors: [{ path: "amountOriginal", message: "Amount must be greater than zero" }],
          };
        }

        const capture = runtime.capture();
        const parsed = createTransactionInput.safeParse({
          id: runtime.id<"transactions">(),
          // The form's date, not the device's `capture().date` — this is the
          // `capturedTz` card's editable-date half. `capture()` above still
          // runs, because the outbox entry needs its own timestamp and zone
          // regardless of which accounting date the row lands on.
          date: draft.date,
          type: draft.type,
          accountId: draft.accountId,
          amountOriginal: normalized,
          currency: account.currency,
          categoryId: draft.categoryId ?? undefined,
          note: draft.note,
          isBusiness: draft.isBusiness,
          counterpartyId: draft.counterpartyId ?? undefined,
          counterpartyRole: draft.counterpartyRole ?? undefined,
        });
        if (!parsed.success) {
          emitClientDiagnostic(diagnostics, {
            scope: "client_action",
            action: "create_transaction",
            phase: "success",
          });
          return { fieldErrors: fieldErrorsFromZod(parsed.error) ?? [] };
        }
        port.createTransaction(parsed.data, capture);
        refresh();
        emitClientDiagnostic(diagnostics, {
          scope: "client_action",
          action: "create_transaction",
          phase: "success",
        });
        return { id: parsed.data.id };
      } catch (error) {
        emitClientDiagnostic(diagnostics, {
          scope: "client_action",
          action: "create_transaction",
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
