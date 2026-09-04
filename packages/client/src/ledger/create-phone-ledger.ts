import { fold } from "@waltning/core/capture/names";
import { type AccountingDate, accountingDate, isAccountingDate } from "@waltning/core/date";
import { type Id, type IdTable, id } from "@waltning/core/id";
import type { CurrencyCode, Money } from "@waltning/core/money";
import * as money from "@waltning/core/money";
import {
  type AccountKind,
  type CategorizeBatchInput,
  type CreateAccountInput,
  type CreateCategoryInput,
  type CreateTransactionInput,
  categorizeBatchInput,
  createAccountInput,
  createCategoryInput,
  createTransactionInput,
  type DeleteTransactionInput,
  deleteTransactionInput,
  type SetTransactionLinesInput,
  setTransactionLinesInput,
  type UpdateTransactionInput,
  updateTransactionInput,
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
 * The ledger's own vocabulary — `@waltning/schema`'s `TxnType`, restated
 * rather than imported: `packages/client` depends on `@waltning/core` alone
 * (`architecture/11`), matching `TransactionRow`'s own `TransactionType` in
 * `packages/ui`.
 */
export type TransactionType = "expense" | "income" | "transfer" | "adjustment";

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
 * One node of the whole category tree — groups and leaves both — for S06's
 * sheet, which browses and filters by group rather than only offering the
 * flat leaf list `PhoneCategory` above carries.
 *
 * Structural, matching `PhoneCategory`: the port is what keeps this package
 * free of the storage engine behind it. **`parentId: null` names a root** —
 * ordinarily a group (`isLeaf: false`), except `Uncategorized`, the one leaf
 * `TAXONOMY.md` seeds at the root (R1/R2: a category is a group or a leaf,
 * two levels, never deeper).
 */
export type PhoneCategoryNode = {
  id: Id<"categories">;
  parentId: Id<"categories"> | null;
  name: string;
  kind: "income" | "expense";
  isLeaf: boolean;
  sort: number;
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

/** S10 §3 — the four values `SegmentControl` offers, exactly `SPEC.md` §6.7's partition. */
export type PhoneTransactionScope = "all" | "mine" | "shared" | "business";

/**
 * `searchTransactions`'s port-level filter — branded ids and a real
 * `AccountingDate`, mirroring `@waltning/ledger`'s `TransactionSearchFilter`
 * structurally (`architecture/11`: no value import across that seam). The
 * controller's own `TransactionFilterDraft`, below, is the plain-string shape
 * a screen builds; `searchTransactions` casts one into the other, the same
 * split `QuickAddDraft` → `CreateTransactionInput` already draws.
 */
export type PhoneSearchFilter = {
  text?: string;
  accountIds?: readonly Id<"accounts">[];
  categoryIds?: readonly Id<"categories">[];
  scope?: PhoneTransactionScope;
  from?: AccountingDate;
  to?: AccountingDate;
};

export type PhoneSearchCursor = { date: AccountingDate; id: Id<"transactions"> };

/** One row of a search page — every field S10's mobile row (or `TransferRow`) needs. */
export type PhoneSearchTransaction = {
  id: Id<"transactions">;
  date: AccountingDate;
  type: "income" | "expense" | "transfer" | "adjustment";
  payee: string;
  note: string;
  categoryName: string | null;
  accountId: Id<"accounts">;
  accountName: string;
  /** Present only on a transfer. */
  toAccountId: Id<"accounts"> | null;
  toAccountName: string | null;
  /** Already signed, the "from" leg. */
  amount: Money;
  currency: CurrencyCode;
  decimals: number;
  /** Already signed, the "to" leg. `null` off a transfer. */
  toAmount: Money | null;
  toCurrency: CurrencyCode | null;
  toDecimals: number | null;
  isBusiness: boolean;
  isCapital: boolean;
};

export type PhoneCurrencyTotal = {
  currency: CurrencyCode;
  decimals: number;
  /** Every live row in range, this currency — both legs of a transfer counted separately. */
  sum: Money;
  /** The same sum with every `isCapital` row's leg left out — S10 §9. */
  sumExcludingCapital: Money;
  /** How many legs of `sum` were capital — 0 means the second total is not worth drawing. */
  capitalCount: number;
};

export type PhoneSearchPage = {
  rows: readonly PhoneSearchTransaction[];
  nextCursor: PhoneSearchCursor | undefined;
  /** Over the whole filtered set, every page — never a per-page figure (S10 §3). */
  total: { count: number; currencies: readonly PhoneCurrencyTotal[] };
};

/** One line of S09's optional breakdown (§10.3) — a receipt-free split too. */
export type PhoneTransactionLine = {
  id: Id<"transactionLines">;
  description: string;
  amount: Money;
  categoryId: Id<"categories"> | null;
  categoryName: string | null;
};

/**
 * S09's whole subject — the row, its account and category names, and its
 * `lines`. Structural, matching `PhoneRecentTransaction` above: the port is
 * what keeps this package free of the storage engine behind it, so this
 * mirrors `@waltning/ledger`'s `LocalTransactionDetail` field-for-field
 * rather than importing it.
 *
 * **`FxAmount`'s full basis, the receipt and the audit history are not
 * here.** `wave-3-shared.md` names all three unbuilt this wave — no rate
 * table (`#e3`), no receipts, no audit log on the phone — and `is_capital`
 * and the counterparty row are deferred too: `FieldsCard` does not offer
 * either yet (`#e3` has no counterparty write path, and `is_capital` has no
 * screen driving it this wave), so carrying them here would be a field with
 * nothing that reads it.
 */
export type PhoneTransactionDetail = {
  id: Id<"transactions">;
  date: AccountingDate;
  type: TransactionType;
  payee: string;
  note: string;
  isBusiness: boolean;
  accountId: Id<"accounts">;
  accountName: string;
  categoryId: Id<"categories"> | null;
  categoryName: string | null;
  /** Already signed, the `"from"` leg — same rule as `PhoneRecentTransaction`. */
  amount: Money;
  currency: CurrencyCode;
  decimals: number;
  version: number;
  lines: readonly PhoneTransactionLine[];
};

export type PhoneLedgerPort = {
  listAccounts: () => readonly PhoneAccount[];
  listCurrencies: () => readonly PhoneCurrency[];
  listGroups: () => readonly PhoneGroup[];
  listRecent: (limit: number) => readonly PhoneRecentTransaction[];
  listCategories: () => readonly PhoneCategory[];
  listCategoryTree: () => readonly PhoneCategoryNode[];
  listCounterparties: () => readonly PhoneCounterparty[];
  listNetWorth: () => readonly PhoneNetWorth[];
  readPeriodSpend: (period: money.Period) => readonly PhonePeriodSpend[];
  listUnsettledClearing: () => readonly PhoneClearingAccount[];
  /** C4 — S10's list. A query, not a snapshot field. */
  searchTransactions: (filter: PhoneSearchFilter, cursor?: PhoneSearchCursor) => PhoneSearchPage;
  createAccount: (input: CreateAccountInput, capture: PhoneCapture) => void;
  createTransaction: (input: CreateTransactionInput, capture: PhoneCapture) => void;
  createCategory: (input: CreateCategoryInput, capture: PhoneCapture) => void;
  /** C4 — S10's swipe-categorize. One category over N ids, refused as a whole or not at all. */
  categorizeBatch: (input: CategorizeBatchInput, capture: PhoneCapture) => void;
  getTransaction: (id: Id<"transactions">) => PhoneTransactionDetail | null;
  updateTransaction: (input: UpdateTransactionInput, capture: PhoneCapture) => void;
  deleteTransaction: (input: DeleteTransactionInput, capture: PhoneCapture) => void;
  setTransactionLines: (input: SetTransactionLinesInput, capture: PhoneCapture) => void;
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

/**
 * §3, per currency — C2's `DualTotal` hero. See `money.netWorth`.
 *
 * `hasShared` decides whether the screen hands `DualTotal` `ours` at all —
 * that component's own contract wants `null`, not the same figure as `mine`,
 * when no shared account exists (`LocalNetWorth`'s own comment says why it is
 * a field rather than a `mine === ours` comparison).
 */
export type PhoneNetWorth = {
  currency: CurrencyCode;
  decimals: number;
  mine: Money;
  ours: Money;
  hasShared: boolean;
};

/** §5's base figure, per currency — C2's *spent* and *net* `StatTile`s. See `money.periodSpend`. */
export type PhonePeriodSpend = money.PeriodSpendRow;

/** §8, minus FIFO attribution — C2's unsettled banner. See `money.unsettledClearing`. */
export type PhoneClearingAccount = money.ClearingAccountRow;

export type PhoneLedgerSnapshot = {
  accounts: readonly PhoneCapturableAccount[];
  currencies: readonly PhoneCurrency[];
  groups: readonly PhoneGroup[];
  recent: readonly PhoneRecentTransaction[];
  categories: readonly PhoneCategory[];
  categoryTree: readonly PhoneCategoryNode[];
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
  /** §3, mine and ours, per currency — `DualTotal`'s hero (C2). */
  netWorth: readonly PhoneNetWorth[];
  /** §8's unsettled clearing accounts — non-empty only when the banner shows (C2). */
  unsettledClearing: readonly PhoneClearingAccount[];
  /**
   * Set from a failed `refresh()`, cleared by the next successful one.
   *
   * **The rest of the snapshot is left as it was**, not blanked — `refresh()`
   * spreads the prior snapshot and adds this field, so the hero keeps its last
   * known figure while the ground panel shows `ErrorState(recoverable)`
   * (S04 §6). Never rendered verbatim: `describeDiagnosticError`'s message is
   * evidence for diagnostics, not catalogue text (`architecture/11`), so a
   * screen reacts to this field's presence and speaks through `en.ts`.
   */
  error?: string;
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

/**
 * The full user-owned subset of `CreateAccountInput` — everything the form
 * asks for, and nothing the operation derives (`id`) or the migration alone
 * sets (`externalId`).
 *
 * Structural rather than imported from `@waltning/ui`, matching `PhoneCurrency`
 * and `PhoneGroup` above: `packages/client` and `packages/ui` are siblings on
 * the floor (`architecture/11-client-architecture.md`), and a value import
 * across that seam would be the first thread of a dependency neither package
 * is supposed to have on the other. `CreateAccountForm`'s own
 * `CreateAccountDraft` is the same shape by construction.
 */
export type CreateAccountDraft = {
  name: string;
  currency: CurrencyCode;
  kind: AccountKind;
  ownership: CreateAccountInput["ownership"];
  isBusiness: boolean;
  openingBalance: string;
  openingDate: string | null;
  memo: string;
  groupId: string | null;
};

/**
 * What S06's create-in-place row can save — a leaf, always (`create_category`
 * never sets `isLeaf: false`, see the executor). `parentId` names the group
 * it was created under, or `null` for the one root exception (`Uncategorized`
 * already exists; a person creating a new root-level leaf is the taxonomy
 * drifting, which is why the sheet scopes `+ New` to a chosen group — this
 * type stays permissive so the controller's own refusal, not the type, is
 * where that is decided).
 */
export type CreateCategoryDraft = {
  name: string;
  kind: "income" | "expense";
  parentId: string | null;
};

/**
 * S10's filter bar, plain-string ids and all — matching `QuickAddDraft`'s own
 * reasoning: this is the shape a screen builds from `MultiSelect`/`Chip`
 * values and a `DateField`'s typed text, and `searchTransactions` below is
 * where those get cast into `Id<Table>` and a real `AccountingDate` (or
 * dropped, for a date still mid-edit — see `validAccountingDate`).
 */
export type TransactionFilterDraft = {
  text?: string;
  accountIds?: readonly string[];
  categoryIds?: readonly string[];
  scope?: PhoneTransactionScope;
  from?: string;
  to?: string;
};

export type TransactionSearchCursorDraft = { date: string; id: string };

/**
 * What a swipe-categorize gesture saves — `categorize_batch`'s own input,
 * plain strings. No `id` to mint (every named row already exists), so the
 * controller's success shape is `{ count }` — how many rows the batch
 * touched — rather than B1's usual `{ id }`.
 */
export type CategorizeBatchDraft = { transactionIds: readonly string[]; categoryId: string };

/**
 * What `FieldsCard` can save — every key optional, so `updateTransaction`
 * sends only what changed (the executor refuses an empty patch). Matches
 * `update_transaction`'s own patch shape, narrowed to the fields the screen
 * exposes this wave: counterparty and `is_capital` are deferred — see
 * `PhoneTransactionDetail`.
 */
export type TransactionFieldPatch = {
  date?: string;
  accountId?: string;
  categoryId?: string | null;
  payee?: string;
  note?: string;
  isBusiness?: boolean;
};

/**
 * One line `LinesCard` can save. Ids stay plain `string`, like every other
 * draft here — `setTransactionLinesInput.parse` inside the controller is
 * where the brand and the shape are actually checked.
 */
export type TransactionLineDraft = {
  id: string;
  description: string;
  amount: string;
  categoryId?: string | null;
};

export type PhoneLedgerController = {
  getSnapshot: () => PhoneLedgerSnapshot;
  subscribe: (listener: () => void) => () => void;
  refresh: () => void;
  /** S09's whole subject, read fresh — not carried in the snapshot. */
  getTransaction: (id: Id<"transactions">) => PhoneTransactionDetail | null;
  createAccount: (
    draft: CreateAccountDraft,
  ) => { id: Id<"accounts"> } | { fieldErrors: readonly FieldError[] };
  createTransaction: (
    draft: QuickAddDraft,
  ) => { id: Id<"transactions"> } | { fieldErrors: readonly FieldError[] };
  createCategory: (
    draft: CreateCategoryDraft,
  ) => { id: Id<"categories"> } | { fieldErrors: readonly FieldError[] };
  /**
   * §5, on demand — not through the observable snapshot. `period` is the
   * screen's own state (S04 §7: only the lower row is period-scoped), so a
   * period change reads straight through the port rather than widening what
   * `refresh()` recomputes for every subscriber on every write.
   */
  readPeriodSpend: (period: money.Period) => readonly PhonePeriodSpend[];
  /**
   * S10, on demand — like `readPeriodSpend` above, a query rather than a
   * snapshot field: a filtered, paged list is asked for, not held for every
   * subscriber to recompute on every write.
   */
  searchTransactions: (
    filter: TransactionFilterDraft,
    cursor?: TransactionSearchCursorDraft,
  ) => PhoneSearchPage;
  categorizeBatch: (
    draft: CategorizeBatchDraft,
  ) => { count: number } | { fieldErrors: readonly FieldError[] };
  updateTransaction: (
    id: Id<"transactions">,
    version: number,
    patch: TransactionFieldPatch,
  ) => { id: Id<"transactions"> } | { fieldErrors: readonly FieldError[] };
  deleteTransaction: (
    id: Id<"transactions">,
    version: number,
  ) => { id: Id<"transactions"> } | { fieldErrors: readonly FieldError[] };
  setTransactionLines: (
    id: Id<"transactions">,
    version: number,
    lines: readonly TransactionLineDraft[],
  ) => { id: Id<"transactions"> } | { fieldErrors: readonly FieldError[] };
  reset: () => void;
};

/**
 * A thrown executor refusal, as a form-level `fieldErrors` entry.
 *
 * `update_transaction`, `delete_transaction` and `set_transaction_lines`
 * have no `fieldErrors` channel of their own — a stale version or a lines
 * sum mismatch (§10.3) is a plain `Error` thrown from inside the write, the
 * same shape `createTransaction` above works around for an uncapturable
 * account. `path: ""` matches no form field on purpose: this screen's own
 * `KNOWN_PATHS` never lists one for "the row moved" or "the lines do not
 * sum", so the message belongs at form level, not pinned to a field that
 * did not cause it. A stale version gets `transactions.changedElsewhere`
 * (the shared plan names it); every other refusal surfaces its own text —
 * inventing a key for a message nobody has read yet would be translating
 * ahead of a decision to keep the wording.
 */
function refusalFromThrow<Caught>(error: Caught): readonly FieldError[] {
  const message = error instanceof Error ? error.message : String(error);
  return message.includes("stale version")
    ? [{ path: "", message, messageKey: "transactions.changedElsewhere" }]
    : [{ path: "", message }];
}

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
    categoryTree: [],
    counterparties: [],
    subtotals: [],
    netWorth: [],
    unsettledClearing: [],
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
        categoryTree: port.listCategoryTree(),
        counterparties: port.listCounterparties(),
        subtotals: subtotalsOf(accounts),
        netWorth: port.listNetWorth(),
        unsettledClearing: port.listUnsettledClearing(),
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
      // S04 §6: the hero keeps its last known figure rather than blanking, so
      // this spreads the prior snapshot instead of replacing it — only `error`
      // is new. Listeners still fire: a screen already mounted needs to hear
      // about this exactly as it hears about a success, or `ErrorState` never
      // appears until something unrelated re-renders it.
      snapshot = { ...snapshot, error: clientFailure(error).message };
      for (const listener of listeners) listener();
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
    readPeriodSpend: (period) => port.readPeriodSpend(period),
    searchTransactions: (filter, cursor) =>
      port.searchTransactions(
        {
          ...(filter.text !== undefined ? { text: filter.text } : {}),
          ...(filter.accountIds
            ? { accountIds: filter.accountIds.map((accountId) => id<"accounts">(accountId)) }
            : {}),
          ...(filter.categoryIds
            ? { categoryIds: filter.categoryIds.map((categoryId) => id<"categories">(categoryId)) }
            : {}),
          ...(filter.scope ? { scope: filter.scope } : {}),
          // A `DateField` mid-edit is not yet a real date — dropped from the
          // filter rather than thrown, the same "not yet a value" treatment
          // `isRealCalendarDate` gives an in-progress typed date elsewhere.
          ...(filter.from !== undefined && isAccountingDate(filter.from)
            ? { from: accountingDate(filter.from) }
            : {}),
          ...(filter.to !== undefined && isAccountingDate(filter.to)
            ? { to: accountingDate(filter.to) }
            : {}),
        },
        cursor
          ? { date: accountingDate(cursor.date), id: id<"transactions">(cursor.id) }
          : undefined,
      ),
    categorizeBatch: (draft) => {
      emitClientDiagnostic(diagnostics, {
        scope: "client_action",
        action: "categorize_batch",
        phase: "start",
      });
      try {
        const capture = runtime.capture();
        const parsed = categorizeBatchInput.safeParse({
          transactionIds: draft.transactionIds,
          categoryId: draft.categoryId,
        });
        if (!parsed.success) {
          emitClientDiagnostic(diagnostics, {
            scope: "client_action",
            action: "categorize_batch",
            phase: "success",
          });
          return { fieldErrors: fieldErrorsFromZod(parsed.error) ?? [] };
        }
        port.categorizeBatch(parsed.data, capture);
        refresh();
        emitClientDiagnostic(diagnostics, {
          scope: "client_action",
          action: "categorize_batch",
          phase: "success",
        });
        return { count: parsed.data.transactionIds.length };
      } catch (error) {
        emitClientDiagnostic(diagnostics, {
          scope: "client_action",
          action: "categorize_batch",
          phase: "failure",
          error: clientFailure(error),
        });
        throw error;
      }
    },
    getTransaction: (id) => port.getTransaction(id),
    createAccount: (draft) => {
      emitClientDiagnostic(diagnostics, {
        scope: "client_action",
        action: "create_account",
        phase: "start",
      });
      try {
        const capture = runtime.capture();
        const parsed = createAccountInput.safeParse({
          id: runtime.id<"accounts">(),
          ...draft,
          openingDate: draft.openingDate ?? undefined,
          groupId: draft.groupId ?? undefined,
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
    createCategory: (draft) => {
      emitClientDiagnostic(diagnostics, {
        scope: "client_action",
        action: "create_category",
        phase: "start",
      });
      try {
        /**
         * **Refused here, before the write.** `S06-category-sheet.md` §6: a
         * failed create "lands inline on the field, naming the existing
         * sibling." The executor has no field-scoped refusal channel — it
         * throws a plain `Error`, the same shape `create_transaction`'s own
         * capturable-account check works around — so the collision is caught
         * proactively against the snapshot's own tree, the same pattern the
         * amount and account checks above already use.
         *
         * Folded (`D1`'s `fold`), scoped to the exact parent and kind: a
         * sibling is a name collision *within one group* (`TAXONOMY.md` R3
         * reads "no name appears twice in the tree", but S06 §6 and the
         * executor's own parent checks both operate one level at a time).
         */
        const target = fold(draft.name);
        const collision = snapshot.categoryTree.find(
          (node) =>
            node.parentId === (draft.parentId ?? null) &&
            node.kind === draft.kind &&
            fold(node.name) === target,
        );
        if (collision) {
          emitClientDiagnostic(diagnostics, {
            scope: "client_action",
            action: "create_category",
            phase: "success",
          });
          return {
            fieldErrors: [{ path: "name", message: `"${collision.name}" already exists here` }],
          };
        }

        const capture = runtime.capture();
        const parsed = createCategoryInput.safeParse({
          id: runtime.id<"categories">(),
          name: draft.name,
          kind: draft.kind,
          parentId: draft.parentId,
        });
        if (!parsed.success) {
          emitClientDiagnostic(diagnostics, {
            scope: "client_action",
            action: "create_category",
            phase: "success",
          });
          return { fieldErrors: fieldErrorsFromZod(parsed.error) ?? [] };
        }
        port.createCategory(parsed.data, capture);
        refresh();
        emitClientDiagnostic(diagnostics, {
          scope: "client_action",
          action: "create_category",
          phase: "success",
        });
        return { id: parsed.data.id };
      } catch (error) {
        emitClientDiagnostic(diagnostics, {
          scope: "client_action",
          action: "create_category",
          phase: "failure",
          error: clientFailure(error),
        });
        throw error;
      }
    },
    updateTransaction: (id, version, patch) => {
      emitClientDiagnostic(diagnostics, {
        scope: "client_action",
        action: "update_transaction",
        phase: "start",
      });
      try {
        const parsed = updateTransactionInput.safeParse({
          id,
          version,
          patch: {
            ...(patch.date !== undefined ? { date: patch.date } : {}),
            ...(patch.accountId !== undefined ? { accountId: patch.accountId } : {}),
            ...("categoryId" in patch ? { categoryId: patch.categoryId } : {}),
            ...(patch.payee !== undefined ? { payee: patch.payee } : {}),
            ...(patch.note !== undefined ? { note: patch.note } : {}),
            ...(patch.isBusiness !== undefined ? { isBusiness: patch.isBusiness } : {}),
          },
        });
        if (!parsed.success) {
          emitClientDiagnostic(diagnostics, {
            scope: "client_action",
            action: "update_transaction",
            phase: "success",
          });
          return { fieldErrors: fieldErrorsFromZod(parsed.error) ?? [] };
        }
        try {
          port.updateTransaction(parsed.data, runtime.capture());
        } catch (writeError) {
          // A version the row moved out from under, or a shape refusal — the
          // one refusal channel `update_transaction`'s executor has is a
          // throw. Caught here, not left to propagate: S09 §6 keeps the
          // draft on the screen and states the refusal on the field, which
          // needs a `fieldErrors` return, not an exception.
          emitClientDiagnostic(diagnostics, {
            scope: "client_action",
            action: "update_transaction",
            phase: "success",
          });
          return { fieldErrors: refusalFromThrow(writeError) };
        }
        refresh();
        emitClientDiagnostic(diagnostics, {
          scope: "client_action",
          action: "update_transaction",
          phase: "success",
        });
        return { id: parsed.data.id };
      } catch (error) {
        emitClientDiagnostic(diagnostics, {
          scope: "client_action",
          action: "update_transaction",
          phase: "failure",
          error: clientFailure(error),
        });
        throw error;
      }
    },
    deleteTransaction: (id, version) => {
      emitClientDiagnostic(diagnostics, {
        scope: "client_action",
        action: "delete_transaction",
        phase: "start",
      });
      try {
        const parsed = deleteTransactionInput.safeParse({ id, version });
        if (!parsed.success) {
          emitClientDiagnostic(diagnostics, {
            scope: "client_action",
            action: "delete_transaction",
            phase: "success",
          });
          return { fieldErrors: fieldErrorsFromZod(parsed.error) ?? [] };
        }
        try {
          port.deleteTransaction(parsed.data, runtime.capture());
        } catch (writeError) {
          emitClientDiagnostic(diagnostics, {
            scope: "client_action",
            action: "delete_transaction",
            phase: "success",
          });
          return { fieldErrors: refusalFromThrow(writeError) };
        }
        refresh();
        emitClientDiagnostic(diagnostics, {
          scope: "client_action",
          action: "delete_transaction",
          phase: "success",
        });
        return { id: parsed.data.id };
      } catch (error) {
        emitClientDiagnostic(diagnostics, {
          scope: "client_action",
          action: "delete_transaction",
          phase: "failure",
          error: clientFailure(error),
        });
        throw error;
      }
    },
    setTransactionLines: (id, version, lines) => {
      emitClientDiagnostic(diagnostics, {
        scope: "client_action",
        action: "set_transaction_lines",
        phase: "start",
      });
      try {
        const parsed = setTransactionLinesInput.safeParse({
          transactionId: id,
          version,
          lines: lines.map((line) => ({
            id: line.id,
            description: line.description,
            amount: line.amount,
            ...(line.categoryId ? { categoryId: line.categoryId } : {}),
          })),
        });
        if (!parsed.success) {
          emitClientDiagnostic(diagnostics, {
            scope: "client_action",
            action: "set_transaction_lines",
            phase: "success",
          });
          return { fieldErrors: fieldErrorsFromZod(parsed.error) ?? [] };
        }
        try {
          port.setTransactionLines(parsed.data, runtime.capture());
        } catch (writeError) {
          // `set_transaction_lines` throws on a sum mismatch (§10.3) the same
          // way `update_transaction` throws on a stale version — caught here
          // so the refusal lands on the breakdown card rather than a crash.
          emitClientDiagnostic(diagnostics, {
            scope: "client_action",
            action: "set_transaction_lines",
            phase: "success",
          });
          return { fieldErrors: refusalFromThrow(writeError) };
        }
        refresh();
        emitClientDiagnostic(diagnostics, {
          scope: "client_action",
          action: "set_transaction_lines",
          phase: "success",
        });
        return { id: parsed.data.transactionId };
      } catch (error) {
        emitClientDiagnostic(diagnostics, {
          scope: "client_action",
          action: "set_transaction_lines",
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
