import { accountingDate } from "@waltning/core/date";
import { type Id, type IdTable, id } from "@waltning/core/id";
import * as money from "@waltning/core/money";
import { type CurrencyCode, currencyCode } from "@waltning/core/money";
import { describe, expect, it, vi } from "vitest";
import type { FieldError } from "../transport/field-errors.ts";
import {
  type CreateAccountDraft,
  createPhoneLedger,
  type PhoneAccount,
  type PhoneCategoryNode,
  type PhoneCounterparty,
  type PhoneCounterpartyBalance,
  type PhoneGroup,
  type PhoneLedgerPort,
  type PhoneRecentTransaction,
  type PhoneTransactionDetail,
  type QuickAddDraft,
} from "./create-phone-ledger.ts";

/** Unwraps the write result in a test, or fails with the refusal's field errors. */
function idOf<Table extends IdTable>(
  result: { id: Id<Table> } | { fieldErrors: readonly FieldError[] },
): Id<Table> {
  if ("id" in result) return result.id;
  throw new Error(`expected an id, got field errors: ${JSON.stringify(result.fieldErrors)}`);
}

/**
 * Two currencies, neither of them the pivot. A fixture holding only USD would
 * pass every assertion below while proving nothing about the case this file
 * exists for.
 */
const CURRENCIES = [
  { code: currencyCode("PLN"), name: "Polish Złoty", symbol: "zł", decimals: 2, capturable: true },
  {
    code: currencyCode("BYN"),
    name: "Belarusian Ruble",
    symbol: "Br",
    decimals: 2,
    capturable: true,
  },
];

const PLN = currencyCode("PLN");
const BYN = currencyCode("BYN");

/** The user-owned draft `createTransaction` takes, for the ordinary expense case. */
function expenseDraft(accountId: string, amount = "10"): QuickAddDraft {
  return {
    type: "expense",
    amount,
    accountId,
    categoryId: null,
    date: "2026-08-23",
    note: "",
    isBusiness: false,
    counterpartyId: null,
    counterpartyRole: null,
  };
}

/** The minimal path — a name and a currency, every other field at its default. */
function minimalDraft(name: string, currency: CurrencyCode): CreateAccountDraft {
  return {
    name,
    currency,
    kind: "other",
    ownership: "own",
    isBusiness: false,
    openingBalance: "0",
    openingDate: null,
    memo: "",
    groupId: null,
  };
}

/** A persisted account, as `listAccounts` would return it. */
function account(
  uuid: string,
  name: string,
  currency: CurrencyCode,
  balance: string,
): PhoneAccount {
  return {
    id: id<"accounts">(uuid),
    name,
    kind: "other",
    currency,
    decimals: 2,
    balance: money.toMoney(balance),
    groupId: null,
    ownership: "own",
    isBusiness: false,
    archived: false,
    expectedBalance: null,
    openingBalance: money.toMoney(balance),
    openingDate: null,
    memo: "",
    version: 1,
  };
}

function harness(diagnostics?: (event: object) => void) {
  let accounts: PhoneAccount[] = [];
  let recent: PhoneRecentTransaction[] = [];
  let groups: PhoneGroup[] = [];
  const createAccount = vi.fn<PhoneLedgerPort["createAccount"]>((input) => {
    accounts = [
      ...accounts,
      {
        id: input.id,
        name: input.name,
        kind: input.kind,
        currency: input.currency,
        decimals: 2,
        balance: input.openingBalance,
        groupId: input.groupId ?? null,
        ownership: input.ownership,
        isBusiness: input.isBusiness,
        archived: false,
        expectedBalance: null,
        openingBalance: input.openingBalance,
        openingDate: input.openingDate ?? null,
        memo: input.memo,
        version: 1,
      },
    ];
  });
  const createTransaction = vi.fn<PhoneLedgerPort["createTransaction"]>((input) => {
    const account = accounts.find((candidate) => candidate.id === input.accountId);
    if (!account) throw new Error("fixture account missing");
    // `create-transaction.executor.ts`'s own `assertBusinessNotShared` (§6.7) —
    // the fixture mirrors the executor's refusal the same way `updateAccount`
    // above mirrors `update_account`'s.
    if (input.isBusiness && account.ownership === "shared") {
      throw new Error(
        "create_transaction: a business transaction cannot sit in a shared account (SPEC.md §6.7, §13.1)",
      );
    }
    accounts = accounts.map((candidate) =>
      candidate.id === input.accountId
        ? { ...candidate, balance: money.sub(candidate.balance, input.amountOriginal) }
        : candidate,
    );
    recent = [
      {
        id: input.id,
        date: input.date,
        payee: input.payee,
        categoryName: null,
        accountName: account.name,
        amount: money.neg(input.amountOriginal),
        currency: input.currency,
        decimals: 2,
        isBusiness: input.isBusiness,
      },
      ...recent,
    ];
  });
  /** A fixture version counter, one per account id — `update`/`archive`'s stale-version refusal needs one to race against. */
  const versions = new Map<string, number>();
  const versionOf = (accountId: string) => versions.get(accountId) ?? 1;
  const updateAccount = vi.fn<PhoneLedgerPort["updateAccount"]>((input) => {
    const current = accounts.find((candidate) => candidate.id === input.id);
    if (!current) throw new Error(`update_account: no account ${input.id}`);
    if (versionOf(input.id) !== input.version) {
      throw new Error(
        `update_account: stale version — read ${input.version}, row is at ${versionOf(input.id)}`,
      );
    }
    const mergedOwnership = input.patch.ownership ?? current.ownership;
    const mergedIsBusiness = input.patch.isBusiness ?? current.isBusiness;
    if (mergedOwnership === "shared" && mergedIsBusiness) {
      throw new Error(
        "update_account: a shared account is never business — §6.7, accounts_shared_not_business",
      );
    }
    versions.set(input.id, versionOf(input.id) + 1);
    accounts = accounts.map((candidate) =>
      candidate.id === input.id
        ? {
            ...candidate,
            name: input.patch.name ?? candidate.name,
            kind: input.patch.kind ?? candidate.kind,
            groupId: input.patch.groupId === undefined ? candidate.groupId : input.patch.groupId,
            ownership: mergedOwnership,
            isBusiness: mergedIsBusiness,
            balance: input.patch.openingBalance ?? current.balance,
            openingBalance: input.patch.openingBalance ?? current.openingBalance,
            openingDate:
              input.patch.openingDate === undefined ? current.openingDate : input.patch.openingDate,
            memo: input.patch.memo ?? current.memo,
            version: versionOf(input.id),
          }
        : candidate,
    );
  });
  const archiveAccount = vi.fn<PhoneLedgerPort["archiveAccount"]>((input) => {
    const current = accounts.find((candidate) => candidate.id === input.id);
    if (!current) throw new Error(`archive_account: no account ${input.id}`);
    if (current.archived) throw new Error(`archive_account: ${input.id} is already archived`);
    if (versionOf(input.id) !== input.version) {
      throw new Error(
        `archive_account: stale version — read ${input.version}, row is at ${versionOf(input.id)}`,
      );
    }
    versions.set(input.id, versionOf(input.id) + 1);
    accounts = accounts.map((candidate) =>
      candidate.id === input.id
        ? { ...candidate, archived: true, version: versionOf(input.id) }
        : candidate,
    );
  });
  const reconcileAccount = vi.fn<PhoneLedgerPort["reconcileAccount"]>((input) => {
    const current = accounts.find((candidate) => candidate.id === input.accountId);
    if (!current) throw new Error(`reconcile_account: no account ${input.accountId}`);
    if (money.dec(input.observedBalance).eq(money.dec(current.balance))) {
      throw new Error(
        `reconcile_account: nothing to reconcile — the ledger already says ${input.observedBalance}`,
      );
    }
    accounts = accounts.map((candidate) =>
      candidate.id === input.accountId
        ? { ...candidate, balance: input.observedBalance, expectedBalance: input.observedBalance }
        : candidate,
    );
  });
  const createGroup = vi.fn<PhoneLedgerPort["createGroup"]>((input) => {
    groups = [
      ...groups,
      { id: input.id, name: input.name, institution: input.institution, sort: 0 },
    ];
  });
  /** As of the fixture's own `versions`-style bookkeeping: a plain pass-through the test drives directly. */
  const balanceAsOf = vi.fn<PhoneLedgerPort["balanceAsOf"]>(
    (accountId) =>
      accounts.find((candidate) => candidate.id === accountId)?.balance ?? money.toMoney("0"),
  );
  const reset = vi.fn(() => {
    accounts = [];
    recent = [];
    groups = [];
  });
  const port: PhoneLedgerPort = {
    listAccounts: (options) =>
      options?.includeArchived ? accounts : accounts.filter((a) => !a.archived),
    listCurrencies: () => CURRENCIES,
    listGroups: () => groups,
    listRecent: (limit) => recent.slice(0, limit),
    listCategories: () => [],
    listCategoryTree: () => [],
    listCounterparties: () => [],
    listPayeeHistory: () => [],
    listNetWorth: () => [],
    readPeriodSpend: () => [],
    listUnsettledClearing: () => [],
    balanceAsOf,
    searchTransactions: () => ({
      rows: [],
      nextCursor: undefined,
      total: { count: 0, currencies: [] },
    }),
    categorizeBatch: () => undefined,
    createAccount,
    createTransaction,
    createCategory: vi.fn(),
    getTransaction: vi.fn(() => null),
    updateTransaction: vi.fn(),
    deleteTransaction: vi.fn(),
    setTransactionLines: vi.fn(),
    updateAccount,
    archiveAccount,
    reconcileAccount,
    createGroup,
    readRate: vi.fn(() => null),
    readCoverage: vi.fn(() => []),
    listFxRates: vi.fn(() => []),
    addCurrency: vi.fn(),
    archiveCurrency: vi.fn(),
    setRateSource: vi.fn(),
    setPinned: vi.fn(),
    changePivot: vi.fn(),
    setManualRate: vi.fn(() => ({ written: 0, replacedManual: 0 })),
    clearManualRate: vi.fn(() => ({ deleted: 0 })),
    createCounterparty: vi.fn(),
    updateCounterparty: vi.fn(),
    mergeCounterparties: vi.fn(),
    unmergeCounterparties: vi.fn(),
    recordDistinctCounterparties: vi.fn(),
    settleDebt: vi.fn(() => ({ residual: money.toMoney("0"), overSettled: false })),
    reset,
  };
  const capture = vi.fn(() => ({
    date: accountingDate("2026-08-23"),
    timeZone: "Europe/Warsaw",
    offsetMinutes: 120,
    at: new Date("2026-08-23T10:00:00Z"),
  }));
  let sequence = 0;
  const controller = createPhoneLedger(port, {
    capture,
    ...(diagnostics ? { diagnostics } : {}),
    id: <Table extends IdTable>() => {
      sequence += 1;
      return id<Table>(`00000000-0000-4000-8000-${String(sequence).padStart(12, "0")}`);
    },
  });
  return {
    controller,
    capture,
    createAccount,
    createTransaction,
    updateAccount,
    archiveAccount,
    reconcileAccount,
    createGroup,
    balanceAsOf,
    reset,
    /** The raw port — the FX methods have no fixture state of their own to assert through, so tests spy on this directly. */
    port,
  };
}

describe("phone ledger controller", () => {
  it("starts with no accounts, no subtotals, and no Recent", () => {
    const { controller } = harness();
    expect(controller.getSnapshot()).toEqual({
      accounts: [],
      archivedAccounts: [],
      currencies: CURRENCIES,
      groups: [],
      recent: [],
      categories: [],
      categoryTree: [],
      counterparties: [],
      archivedCounterparties: [],
      subtotals: [],
      netWorth: [],
      unsettledClearing: [],
    });
  });

  it("creates an account in the currency it was given, through the shared defaults", () => {
    const { controller, createAccount } = harness();
    const accountId = idOf(controller.createAccount(minimalDraft("Bank A · PLN", PLN)));

    expect(accountId).toBe(controller.getSnapshot().accounts[0]?.id);
    expect(createAccount.mock.calls[0]?.[0]).toMatchObject({
      name: "Bank A · PLN",
      currency: PLN,
      kind: "other",
      ownership: "own",
      openingBalance: money.toMoney("0"),
      memo: "",
      isBusiness: false,
    });
  });

  /**
   * **The test that replaces a throw.**
   *
   * `refresh()` used to scan for an account that was not `USD` and throw
   * *"phone preview cannot combine non-USD accounts"* — which was not a
   * refusal to *combine*, it was a refusal to *exist*: one złoty account made
   * every launch crash before the first render. What it was really guarding was
   * the line under it, `money.sum` over every balance labelled `USD`. Deleting
   * the throw without deleting the sum would have turned a loud failure into a
   * wrong number, so this asserts the shape that makes both unnecessary.
   */
  it("subtotals per currency, in ledger order, and never across two", () => {
    const port: PhoneLedgerPort = {
      listAccounts: () => [
        account("11111111-1111-4111-8111-111111111111", "Bank A · PLN", PLN, "10"),
        account("33333333-3333-4333-8333-333333333333", "Bank B · BYN", BYN, "40"),
        account("44444444-4444-4444-8444-444444444444", "Cash · PLN", PLN, "2.50"),
      ],
      listCurrencies: () => CURRENCIES,
      listGroups: () => [],
      listRecent: () => [],
      listCategories: () => [],
      listCategoryTree: () => [],
      listCounterparties: () => [],
      listPayeeHistory: () => [],
      listNetWorth: () => [],
      readPeriodSpend: () => [],
      listUnsettledClearing: () => [],
      balanceAsOf: vi.fn(),
      searchTransactions: () => ({
        rows: [],
        nextCursor: undefined,
        total: { count: 0, currencies: [] },
      }),
      categorizeBatch: () => undefined,
      createAccount: vi.fn(),
      createTransaction: vi.fn(),
      createCategory: vi.fn(),
      getTransaction: vi.fn(() => null),
      updateTransaction: vi.fn(),
      deleteTransaction: vi.fn(),
      setTransactionLines: vi.fn(),
      updateAccount: vi.fn(),
      archiveAccount: vi.fn(),
      reconcileAccount: vi.fn(),
      createGroup: vi.fn(),
      readRate: vi.fn(() => null),
      readCoverage: vi.fn(() => []),
      listFxRates: vi.fn(() => []),
      addCurrency: vi.fn(),
      archiveCurrency: vi.fn(),
      setRateSource: vi.fn(),
      setPinned: vi.fn(),
      changePivot: vi.fn(),
      setManualRate: vi.fn(() => ({ written: 0, replacedManual: 0 })),
      clearManualRate: vi.fn(() => ({ deleted: 0 })),
      createCounterparty: vi.fn(),
      updateCounterparty: vi.fn(),
      mergeCounterparties: vi.fn(),
      unmergeCounterparties: vi.fn(),
      recordDistinctCounterparties: vi.fn(),
      settleDebt: vi.fn(() => ({ residual: money.toMoney("0"), overSettled: false })),
      reset: vi.fn(),
    };

    const controller = createPhoneLedger(port, {
      capture: vi.fn(),
      id: <Table extends IdTable>() => id<Table>("22222222-2222-4222-8222-222222222222"),
    });

    expect(controller.getSnapshot().subtotals).toEqual([
      { currency: PLN, decimals: 2, balance: money.toMoney("12.50") },
      { currency: BYN, decimals: 2, balance: money.toMoney("40") },
    ]);
  });

  /**
   * Order is the ledger's, not the numbers'. `40` sorts above `12.50` on
   * magnitude and that ranking would be a comparison across currencies the app
   * cannot make — so the złoty account being *first* is the whole assertion,
   * and it is why the fixture above puts the larger figure second.
   */
  it("orders subtotals by the accounts, never by size", () => {
    const port: PhoneLedgerPort = {
      listAccounts: () => [
        account("33333333-3333-4333-8333-333333333333", "Bank B · BYN", BYN, "9000"),
        account("11111111-1111-4111-8111-111111111111", "Bank A · PLN", PLN, "1"),
      ],
      listCurrencies: () => CURRENCIES,
      listGroups: () => [],
      listRecent: () => [],
      listCategories: () => [],
      listCategoryTree: () => [],
      listCounterparties: () => [],
      listPayeeHistory: () => [],
      listNetWorth: () => [],
      readPeriodSpend: () => [],
      listUnsettledClearing: () => [],
      balanceAsOf: vi.fn(),
      searchTransactions: () => ({
        rows: [],
        nextCursor: undefined,
        total: { count: 0, currencies: [] },
      }),
      categorizeBatch: () => undefined,
      createAccount: vi.fn(),
      createTransaction: vi.fn(),
      createCategory: vi.fn(),
      getTransaction: vi.fn(() => null),
      updateTransaction: vi.fn(),
      deleteTransaction: vi.fn(),
      setTransactionLines: vi.fn(),
      updateAccount: vi.fn(),
      archiveAccount: vi.fn(),
      reconcileAccount: vi.fn(),
      createGroup: vi.fn(),
      readRate: vi.fn(() => null),
      readCoverage: vi.fn(() => []),
      listFxRates: vi.fn(() => []),
      addCurrency: vi.fn(),
      archiveCurrency: vi.fn(),
      setRateSource: vi.fn(),
      setPinned: vi.fn(),
      changePivot: vi.fn(),
      setManualRate: vi.fn(() => ({ written: 0, replacedManual: 0 })),
      clearManualRate: vi.fn(() => ({ deleted: 0 })),
      createCounterparty: vi.fn(),
      updateCounterparty: vi.fn(),
      mergeCounterparties: vi.fn(),
      unmergeCounterparties: vi.fn(),
      recordDistinctCounterparties: vi.fn(),
      settleDebt: vi.fn(() => ({ residual: money.toMoney("0"), overSettled: false })),
      reset: vi.fn(),
    };

    const controller = createPhoneLedger(port, {
      capture: vi.fn(),
      id: <Table extends IdTable>() => id<Table>("22222222-2222-4222-8222-222222222222"),
    });

    expect(controller.getSnapshot().subtotals.map((s) => s.currency)).toEqual([BYN, PLN]);
  });

  it("creates one captured expense and refreshes the subtotals and Recent", () => {
    const { controller, capture, createTransaction } = harness();
    const accountId = idOf(controller.createAccount(minimalDraft("Bank A · PLN", PLN)));
    const transactionId = idOf(controller.createTransaction(expenseDraft(accountId)));

    expect(capture).toHaveBeenCalledTimes(2);
    expect(createTransaction.mock.calls[0]?.[0]).toMatchObject({
      id: transactionId,
      date: accountingDate("2026-08-23"),
      type: "expense",
      accountId,
      amountOriginal: money.toMoney("10"),
      currency: PLN,
    });
    expect(controller.getSnapshot().subtotals).toEqual([
      { currency: PLN, decimals: 2, balance: money.toMoney("-10") },
    ]);
    expect(controller.getSnapshot().recent[0]?.id).toBe(transactionId);
  });

  /**
   * The draft is the user-owned subset of `CreateTransactionInput` (B3) — an
   * income, its category, its editable date, a note, business, and a
   * counterparty and role all reach the write, not only amount and account.
   */
  it("carries income, category, date, note, business and counterparty through to the write", () => {
    const { controller, createTransaction } = harness();
    const accountId = idOf(controller.createAccount(minimalDraft("Bank A · PLN", PLN)));

    controller.createTransaction({
      type: "income",
      amount: "25",
      accountId,
      categoryId: "cccccccc-cccc-4ccc-8ccc-cccccccccccc",
      date: "2026-07-01",
      note: "Freelance invoice",
      isBusiness: true,
      counterpartyId: "dddddddd-dddd-4ddd-8ddd-dddddddddddd",
      counterpartyRole: "reference",
    });

    expect(createTransaction.mock.calls[0]?.[0]).toMatchObject({
      type: "income",
      amountOriginal: money.toMoney("25"),
      categoryId: "cccccccc-cccc-4ccc-8ccc-cccccccccccc",
      date: accountingDate("2026-07-01"),
      note: "Freelance invoice",
      isBusiness: true,
      counterpartyId: "dddddddd-dddd-4ddd-8ddd-dddddddddddd",
      counterpartyRole: "reference",
    });
  });

  /**
   * §6.7's phone mirror — `create-transaction.executor.ts`'s own
   * `assertBusinessNotShared`, reached here through the same
   * refusal-to-field-error path `updateAccount`'s "never business" already
   * takes, named onto `isBusiness` (the field the composer's scope chip
   * renders it under) rather than `updateAccount`'s own `accounts.sharedNotBusiness`.
   */
  it("refuses a business transaction into a shared account, naming isBusiness", () => {
    const { controller, createTransaction } = harness();
    const accountId = idOf(
      controller.createAccount({ ...minimalDraft("Joint · PLN", PLN), ownership: "shared" }),
    );

    const result = controller.createTransaction({ ...expenseDraft(accountId), isBusiness: true });

    expect("fieldErrors" in result && result.fieldErrors).toEqual([
      {
        path: "isBusiness",
        message: expect.stringContaining("cannot sit in a shared account"),
        messageKey: "transactions.sharedNeverBusiness",
      },
    ]);
    // The refused write left no captured row behind — the port's own
    // `createTransaction` threw before returning, so nothing landed in Recent.
    expect(createTransaction).toHaveBeenCalledOnce();
    expect(controller.getSnapshot().recent).toEqual([]);
  });

  it.each(["0", "-1"])("rejects the non-positive amount %s before writing", (amount) => {
    const { controller, createTransaction } = harness();
    const accountId = idOf(controller.createAccount(minimalDraft("Bank A · PLN", PLN)));
    const result = controller.createTransaction(expenseDraft(accountId, amount));
    expect("fieldErrors" in result && result.fieldErrors).toEqual([
      { path: "amountOriginal", message: "Amount must be greater than zero" },
    ]);
    expect(createTransaction).not.toHaveBeenCalled();
  });

  /**
   * **The write is refused before the outbox is touched.**
   *
   * `provisionalFxRate` refuses the same capture, but it does so mid-transaction
   * — after the outbox entry has committed, since §14.6 commits intent first —
   * and with a message written for a sync log. On a phone with no backend that
   * entry drains nowhere, so the capture becomes an invisible row rather than a
   * refusal someone can act on.
   */
  it("refuses an expense in a currency the ledger holds no rate for", () => {
    const port: PhoneLedgerPort = {
      listAccounts: () => [
        account("11111111-1111-4111-8111-111111111111", "Bank A · PLN", PLN, "0"),
      ],
      listCurrencies: () => [
        { code: PLN, name: "Polish Złoty", symbol: "zł", decimals: 2, capturable: false },
      ],
      listGroups: () => [],
      listRecent: () => [],
      listCategories: () => [],
      listCategoryTree: () => [],
      listCounterparties: () => [],
      listPayeeHistory: () => [],
      listNetWorth: () => [],
      readPeriodSpend: () => [],
      listUnsettledClearing: () => [],
      balanceAsOf: vi.fn(),
      searchTransactions: () => ({
        rows: [],
        nextCursor: undefined,
        total: { count: 0, currencies: [] },
      }),
      categorizeBatch: () => undefined,
      createAccount: vi.fn(),
      createTransaction: vi.fn(),
      createCategory: vi.fn(),
      getTransaction: vi.fn(() => null),
      updateTransaction: vi.fn(),
      deleteTransaction: vi.fn(),
      setTransactionLines: vi.fn(),
      updateAccount: vi.fn(),
      archiveAccount: vi.fn(),
      reconcileAccount: vi.fn(),
      createGroup: vi.fn(),
      readRate: vi.fn(() => null),
      readCoverage: vi.fn(() => []),
      listFxRates: vi.fn(() => []),
      addCurrency: vi.fn(),
      archiveCurrency: vi.fn(),
      setRateSource: vi.fn(),
      setPinned: vi.fn(),
      changePivot: vi.fn(),
      setManualRate: vi.fn(() => ({ written: 0, replacedManual: 0 })),
      clearManualRate: vi.fn(() => ({ deleted: 0 })),
      createCounterparty: vi.fn(),
      updateCounterparty: vi.fn(),
      mergeCounterparties: vi.fn(),
      unmergeCounterparties: vi.fn(),
      recordDistinctCounterparties: vi.fn(),
      settleDebt: vi.fn(() => ({ residual: money.toMoney("0"), overSettled: false })),
      reset: vi.fn(),
    };
    const controller = createPhoneLedger(port, {
      capture: vi.fn(),
      id: <Table extends IdTable>() => id<Table>("22222222-2222-4222-8222-222222222222"),
    });

    expect(controller.getSnapshot().accounts[0]?.capturable).toBe(false);
    const result = controller.createTransaction(
      expenseDraft("11111111-1111-4111-8111-111111111111"),
    );
    expect("fieldErrors" in result && result.fieldErrors).toEqual([
      {
        path: "accountId",
        message: "PLN needs an exchange rate before a transaction can be recorded in it",
        messageKey: "transactions.needsRate",
        params: { currency: "PLN" },
      },
    ]);
    expect(port.createTransaction).not.toHaveBeenCalled();
  });

  it("rejects a missing account before writing", () => {
    const { controller, createTransaction } = harness();
    const result = controller.createTransaction(
      expenseDraft("99999999-9999-4999-8999-999999999999"),
    );
    expect("fieldErrors" in result && result.fieldErrors).toEqual([
      { path: "accountId", message: "Choose an account before saving" },
    ]);
    expect(createTransaction).not.toHaveBeenCalled();
  });

  it("resets, refreshes, and notifies once", () => {
    const { controller, reset } = harness();
    controller.createAccount(minimalDraft("Bank A · PLN", PLN));
    const listener = vi.fn();
    controller.subscribe(listener);

    controller.reset();

    expect(reset).toHaveBeenCalledTimes(1);
    expect(controller.getSnapshot().accounts).toEqual([]);
    expect(listener).toHaveBeenCalledTimes(1);
  });

  it("reports actions and state updates without ledger values", () => {
    const diagnostics: object[] = [];
    const { controller } = harness((event) => diagnostics.push(event));

    const accountId = idOf(controller.createAccount(minimalDraft("Bank A · PLN", PLN)));
    controller.createTransaction(expenseDraft(accountId));

    expect(diagnostics).toContainEqual({
      scope: "client_action",
      action: "create_account",
      phase: "success",
    });
    expect(diagnostics).toContainEqual({
      scope: "client_action",
      action: "create_transaction",
      phase: "success",
    });
    expect(diagnostics).toContainEqual({
      scope: "client_state",
      update: "phone_ledger_refresh",
      phase: "success",
    });
    const serialized = JSON.stringify(diagnostics);
    expect(serialized).not.toContain("Bank A · PLN");
    expect(serialized).not.toContain("10.00000000");
  });

  describe("updateAccount", () => {
    it("patches only what changed and refreshes the list", () => {
      const { controller, updateAccount } = harness();
      const accountId = idOf(controller.createAccount(minimalDraft("Bank A · PLN", PLN)));

      const result = controller.updateAccount({
        id: accountId,
        version: 1,
        patch: { name: "Bank A · renamed" },
      });

      expect("id" in result && result.id).toBe(accountId);
      expect(updateAccount.mock.calls[0]?.[0]).toMatchObject({
        id: accountId,
        version: 1,
        patch: { name: "Bank A · renamed" },
      });
      expect(controller.getSnapshot().accounts[0]?.name).toBe("Bank A · renamed");
    });

    it("refuses a stale version with a field error on version", () => {
      const { controller } = harness();
      const accountId = idOf(controller.createAccount(minimalDraft("Bank A · PLN", PLN)));

      const result = controller.updateAccount({
        id: accountId,
        version: 99,
        patch: { name: "Whatever" },
      });

      expect("fieldErrors" in result && result.fieldErrors).toEqual([
        {
          path: "version",
          message: expect.stringContaining("stale version"),
          messageKey: "accounts.staleVersion",
        },
      ]);
    });

    it("refuses turning a shared account business, with a field error on isBusiness", () => {
      const { controller } = harness();
      const accountId = idOf(
        controller.createAccount({ ...minimalDraft("Household · PLN", PLN), ownership: "shared" }),
      );

      const result = controller.updateAccount({
        id: accountId,
        version: 1,
        patch: { isBusiness: true },
      });

      expect("fieldErrors" in result && result.fieldErrors).toEqual([
        {
          path: "isBusiness",
          message: expect.stringContaining("never business"),
          messageKey: "accounts.sharedNotBusiness",
        },
      ]);
    });

    it("refuses an empty patch before writing", () => {
      const { controller, updateAccount } = harness();
      const accountId = idOf(controller.createAccount(minimalDraft("Bank A · PLN", PLN)));

      const result = controller.updateAccount({ id: accountId, version: 1, patch: {} });

      expect("fieldErrors" in result).toBe(true);
      expect(updateAccount).not.toHaveBeenCalled();
    });
  });

  describe("archiveAccount", () => {
    it("archives, drops the account from the active list, and refuses a second archive", () => {
      const { controller } = harness();
      const accountId = idOf(controller.createAccount(minimalDraft("Bank A · PLN", PLN)));

      const result = controller.archiveAccount({ id: accountId, version: 1 });

      expect("id" in result && result.id).toBe(accountId);
      expect(controller.getSnapshot().accounts).toHaveLength(0);

      const second = controller.archiveAccount({ id: accountId, version: 2 });
      expect("fieldErrors" in second).toBe(true);
    });
  });

  describe("reconcileAccount", () => {
    it("writes an adjustment and refuses a zero difference", () => {
      const { controller } = harness();
      const accountId = idOf(controller.createAccount(minimalDraft("Bank A · PLN", PLN)));

      const zero = controller.reconcileAccount({
        accountId,
        observedBalance: "0",
        asOf: "2026-08-23",
        note: "",
        categoryId: null,
      });
      expect("fieldErrors" in zero && zero.fieldErrors).toEqual([
        {
          path: "observedBalance",
          message: expect.stringContaining("nothing to reconcile"),
          messageKey: "accounts.nothingToReconcile",
        },
      ]);

      const result = controller.reconcileAccount({
        accountId,
        observedBalance: "42.20",
        asOf: "2026-08-23",
        note: "cash spent, not recorded",
        categoryId: null,
      });
      expect("id" in result).toBe(true);
      expect(controller.getSnapshot().accounts[0]?.expectedBalance).toBe(money.toMoney("42.20"));
    });
  });

  describe("createGroup", () => {
    it("creates a group and it appears in the list", () => {
      const { controller } = harness();

      const result = controller.createGroup({ name: "Bank A", institution: "Bank A" });

      expect("id" in result).toBe(true);
      expect(controller.getSnapshot().groups).toEqual([
        expect.objectContaining({ name: "Bank A", institution: "Bank A" }),
      ]);
    });
  });

  describe("loadArchived", () => {
    it("is empty until asked, then carries archived accounts apart from the active list", () => {
      const { controller } = harness();
      const activeId = idOf(controller.createAccount(minimalDraft("Bank A · PLN", PLN)));
      const archivedId = idOf(controller.createAccount(minimalDraft("Old · PLN", PLN)));
      controller.archiveAccount({ id: archivedId, version: 1 });

      expect(controller.getSnapshot().archivedAccounts).toEqual([]);
      expect(controller.getSnapshot().accounts.map((a) => a.id)).toEqual([activeId]);

      controller.loadArchived();

      expect(controller.getSnapshot().archivedAccounts.map((a) => a.id)).toEqual([archivedId]);
      expect(controller.getSnapshot().accounts.map((a) => a.id)).toEqual([activeId]);
    });
  });

  describe("balanceAsOf", () => {
    it("passes the account id and date straight through to the port", () => {
      const { controller, balanceAsOf } = harness();
      const accountId = idOf(controller.createAccount(minimalDraft("Bank A · PLN", PLN)));

      const result = controller.balanceAsOf(accountId, accountingDate("2026-08-15"));

      expect(balanceAsOf).toHaveBeenCalledWith(accountId, accountingDate("2026-08-15"));
      expect(result).toBe(money.toMoney("0"));
    });
  });
});

describe("phone ledger controller — FX (E3)", () => {
  it("addCurrency: a throwing port maps to fieldErrors, a success calls refresh and returns the code", () => {
    const { controller, port } = harness();
    const listener = vi.fn();
    controller.subscribe(listener);

    (port.addCurrency as ReturnType<typeof vi.fn>).mockImplementationOnce(() => {
      throw new Error("add_currency: CHF already exists, live");
    });
    const refused = controller.addCurrency({ code: "CHF", name: "Swiss Franc" });
    expect("fieldErrors" in refused && refused.fieldErrors).toEqual([
      { path: "", message: expect.stringContaining("already exists") },
    ]);
    expect(listener).not.toHaveBeenCalled();

    const result = controller.addCurrency({ code: "CHF", name: "Swiss Franc" });
    expect(result).toEqual({ code: currencyCode("CHF") });
    expect(listener).toHaveBeenCalledTimes(1);
  });

  it("archiveCurrency: a throwing port maps to fieldErrors, a success calls refresh and returns the code", () => {
    const { controller, port } = harness();
    const listener = vi.fn();
    controller.subscribe(listener);

    (port.archiveCurrency as ReturnType<typeof vi.fn>).mockImplementationOnce(() => {
      throw new Error("archive_currency: PLN is the pivot — change_pivot before archiving it");
    });
    const refused = controller.archiveCurrency({ code: "PLN", version: 1 });
    expect("fieldErrors" in refused && refused.fieldErrors).toEqual([
      { path: "", message: expect.stringContaining("is the pivot") },
    ]);
    expect(listener).not.toHaveBeenCalled();

    const result = controller.archiveCurrency({ code: "BYN", version: 1 });
    expect(result).toEqual({ code: currencyCode("BYN") });
    expect(listener).toHaveBeenCalledTimes(1);
  });

  it("setRateSource: a throwing port maps to fieldErrors, a success calls refresh and returns the code", () => {
    const { controller, port } = harness();
    const listener = vi.fn();
    controller.subscribe(listener);

    (port.setRateSource as ReturnType<typeof vi.fn>).mockImplementationOnce(() => {
      throw new Error("set_rate_source: stale version — read 1, row is at 2");
    });
    const refused = controller.setRateSource({ code: "PLN", version: 1, rateSource: "nbp" });
    expect("fieldErrors" in refused && refused.fieldErrors).toEqual([
      {
        path: "",
        message: expect.stringContaining("stale version"),
        messageKey: "transactions.changedElsewhere",
      },
    ]);
    expect(listener).not.toHaveBeenCalled();

    const result = controller.setRateSource({ code: "PLN", version: 1, rateSource: "nbp" });
    expect(result).toEqual({ code: currencyCode("PLN") });
    expect(listener).toHaveBeenCalledTimes(1);
  });

  it("setPinned: a throwing port maps to fieldErrors, a success calls refresh and returns the code", () => {
    const { controller, port } = harness();
    const listener = vi.fn();
    controller.subscribe(listener);

    (port.setPinned as ReturnType<typeof vi.fn>).mockImplementationOnce(() => {
      throw new Error("set_pinned: stale version — read 1, row is at 2");
    });
    const refused = controller.setPinned({ code: "PLN", version: 1, pinned: true });
    expect("fieldErrors" in refused && refused.fieldErrors).toEqual([
      {
        path: "",
        message: expect.stringContaining("stale version"),
        messageKey: "transactions.changedElsewhere",
      },
    ]);
    expect(listener).not.toHaveBeenCalled();

    const result = controller.setPinned({ code: "PLN", version: 1, pinned: true });
    expect(result).toEqual({ code: currencyCode("PLN") });
    expect(listener).toHaveBeenCalledTimes(1);
  });

  it("changePivot: a throwing port maps to fieldErrors, a success calls refresh and returns the code", () => {
    const { controller, port } = harness();
    const listener = vi.fn();
    controller.subscribe(listener);

    (port.changePivot as ReturnType<typeof vi.fn>).mockImplementationOnce(() => {
      throw new Error("change_pivot: refused — a phone alone cannot re-rate existing transactions");
    });
    const refused = controller.changePivot({ code: "USD" });
    expect("fieldErrors" in refused && refused.fieldErrors).toEqual([
      { path: "", message: expect.stringContaining("cannot re-rate") },
    ]);
    expect(listener).not.toHaveBeenCalled();

    const result = controller.changePivot({ code: "USD" });
    expect(result).toEqual({ code: currencyCode("USD") });
    expect(listener).toHaveBeenCalledTimes(1);
  });

  it("setManualRate: a throwing port maps to fieldErrors, a success calls refresh and returns written/replacedManual", () => {
    const { controller, port } = harness();
    const listener = vi.fn();
    controller.subscribe(listener);
    const range = { base: "USD", quote: "PLN", from: "2026-01-01", to: "2026-01-03" };

    (port.setManualRate as ReturnType<typeof vi.fn>).mockImplementationOnce(() => {
      throw new Error("set_manual_rate: a manual rate already exists for 2026-01-01");
    });
    const refused = controller.setManualRate({ ...range, rate: "3.8100" });
    expect("fieldErrors" in refused && refused.fieldErrors).toEqual([
      { path: "", message: expect.stringContaining("already exists") },
    ]);
    expect(listener).not.toHaveBeenCalled();

    (port.setManualRate as ReturnType<typeof vi.fn>).mockImplementationOnce(() => ({
      written: 3,
      replacedManual: 0,
    }));
    const result = controller.setManualRate({ ...range, rate: "3.8100" });
    expect(result).toEqual({ written: 3, replacedManual: 0 });
    expect(listener).toHaveBeenCalledTimes(1);
  });

  it("clearManualRate: a throwing port maps to fieldErrors, a success calls refresh and returns deleted", () => {
    const { controller, port } = harness();
    const listener = vi.fn();
    controller.subscribe(listener);
    const range = { base: "USD", quote: "PLN", from: "2026-01-05", to: "2026-01-01" };

    // The range itself is invalid (end before start) on the first call — a
    // schema refusal, never reaching the port at all.
    const schemaRefused = controller.clearManualRate(range);
    expect("fieldErrors" in schemaRefused).toBe(true);
    expect(port.clearManualRate).not.toHaveBeenCalled();

    const validRange = { base: "USD", quote: "PLN", from: "2026-01-01", to: "2026-01-05" };
    (port.clearManualRate as ReturnType<typeof vi.fn>).mockImplementationOnce(() => {
      throw new Error("clear_manual_rate: refused");
    });
    const refused = controller.clearManualRate(validRange);
    expect("fieldErrors" in refused && refused.fieldErrors).toEqual([
      { path: "", message: expect.stringContaining("refused") },
    ]);
    expect(listener).not.toHaveBeenCalled();

    (port.clearManualRate as ReturnType<typeof vi.fn>).mockImplementationOnce(() => ({
      deleted: 5,
    }));
    const result = controller.clearManualRate(validRange);
    expect(result).toEqual({ deleted: 5 });
    expect(listener).toHaveBeenCalledTimes(1);
  });
});

describe("phone ledger controller — createCategory", () => {
  const GROUP = id<"categories">("55555555-5555-4555-8555-555555555555");
  const LEAF = id<"categories">("66666666-6666-4666-8666-666666666666");
  const NEW_ID = id<"categories">("77777777-7777-4777-8777-777777777777");

  function categoryHarness() {
    let tree: PhoneCategoryNode[] = [
      { id: GROUP, parentId: null, name: "Food", kind: "expense", isLeaf: false, sort: 0 },
      { id: LEAF, parentId: GROUP, name: "Groceries", kind: "expense", isLeaf: true, sort: 0 },
    ];
    const createCategory = vi.fn<PhoneLedgerPort["createCategory"]>((input) => {
      tree = [
        ...tree,
        {
          id: input.id,
          parentId: input.parentId,
          name: input.name,
          kind: input.kind,
          isLeaf: true,
          sort: 0,
        },
      ];
    });
    const port: PhoneLedgerPort = {
      listAccounts: () => [],
      listCurrencies: () => CURRENCIES,
      listGroups: () => [],
      listRecent: () => [],
      listCategories: () => [],
      listCategoryTree: () => tree,
      listCounterparties: () => [],
      listPayeeHistory: () => [],
      listNetWorth: () => [],
      readPeriodSpend: () => [],
      listUnsettledClearing: () => [],
      balanceAsOf: vi.fn(),
      searchTransactions: () => ({
        rows: [],
        nextCursor: undefined,
        total: { count: 0, currencies: [] },
      }),
      categorizeBatch: () => undefined,
      createAccount: vi.fn(),
      createTransaction: vi.fn(),
      createCategory,
      getTransaction: vi.fn(() => null),
      updateTransaction: vi.fn(),
      deleteTransaction: vi.fn(),
      setTransactionLines: vi.fn(),
      updateAccount: vi.fn(),
      archiveAccount: vi.fn(),
      reconcileAccount: vi.fn(),
      createGroup: vi.fn(),
      readRate: vi.fn(() => null),
      readCoverage: vi.fn(() => []),
      listFxRates: vi.fn(() => []),
      addCurrency: vi.fn(),
      archiveCurrency: vi.fn(),
      setRateSource: vi.fn(),
      setPinned: vi.fn(),
      changePivot: vi.fn(),
      setManualRate: vi.fn(() => ({ written: 0, replacedManual: 0 })),
      clearManualRate: vi.fn(() => ({ deleted: 0 })),
      createCounterparty: vi.fn(),
      updateCounterparty: vi.fn(),
      mergeCounterparties: vi.fn(),
      unmergeCounterparties: vi.fn(),
      recordDistinctCounterparties: vi.fn(),
      settleDebt: vi.fn(() => ({ residual: money.toMoney("0"), overSettled: false })),
      reset: vi.fn(),
    };
    const controller = createPhoneLedger(port, {
      capture: () => ({
        date: accountingDate("2026-08-23"),
        timeZone: "Europe/Warsaw",
        offsetMinutes: 120,
        at: new Date("2026-08-23T10:00:00Z"),
      }),
      id: <Table extends IdTable>() => id<Table>(NEW_ID),
    });
    return { controller, createCategory };
  }

  it("creates a leaf under the chosen group and the tree refreshes", () => {
    const { controller, createCategory } = categoryHarness();
    const result = controller.createCategory({
      name: "Eating out",
      kind: "expense",
      parentId: GROUP,
    });
    const categoryId = idOf(result);
    expect(categoryId).toBe(NEW_ID);
    expect(createCategory).toHaveBeenCalledTimes(1);
    expect(createCategory.mock.calls[0]?.[0]).toMatchObject({
      name: "Eating out",
      kind: "expense",
      parentId: GROUP,
    });
    expect(controller.getSnapshot().categoryTree).toContainEqual(
      expect.objectContaining({ id: categoryId, name: "Eating out", parentId: GROUP }),
    );
  });

  /** S06 §6: a name collision lands on the field, naming the existing sibling. */
  it("refuses a sibling with the same folded name in the same group, before writing", () => {
    const { controller, createCategory } = categoryHarness();
    const result = controller.createCategory({
      name: "groceries",
      kind: "expense",
      parentId: GROUP,
    });
    expect("fieldErrors" in result && result.fieldErrors).toEqual([
      { path: "name", message: '"Groceries" already exists here' },
    ]);
    expect(createCategory).not.toHaveBeenCalled();
  });

  it("does not confuse a same-named leaf sitting under a different group", () => {
    const { controller, createCategory } = categoryHarness();
    const OTHER_GROUP = id<"categories">("88888888-8888-4888-8888-888888888888");
    const result = controller.createCategory({
      name: "Groceries",
      kind: "expense",
      parentId: OTHER_GROUP,
    });
    expect("id" in result).toBe(true);
    expect(createCategory).toHaveBeenCalledTimes(1);
  });
});

describe("phone ledger controller — transaction detail writes (C5)", () => {
  const TXN = id<"transactions">("99999999-9999-4999-8999-999999999999");
  const PLN = currencyCode("PLN");

  /**
   * A minimal in-memory row + version, mutated by the fake `updateTransaction`
   * / `deleteTransaction` / `setTransactionLines` the way the real executors
   * mutate SQLite — version-checked, refusing with the same message text the
   * executors throw, so `refusalFromThrow`'s pattern match has something real
   * to match against.
   */
  function detailHarness() {
    let row: PhoneTransactionDetail | null = {
      id: TXN,
      date: accountingDate("2026-08-06"),
      type: "expense",
      payee: "Café A",
      note: "",
      isBusiness: false,
      accountId: id<"accounts">("22222222-2222-4222-8222-222222222222"),
      accountName: "Cash · PLN",
      categoryId: null,
      categoryName: null,
      amount: money.toMoney("-48.90"),
      currency: PLN,
      decimals: 2,
      version: 1,
      lines: [],
    };

    const getTransaction = vi.fn<PhoneLedgerPort["getTransaction"]>(() => row);
    const updateTransaction = vi.fn<PhoneLedgerPort["updateTransaction"]>((input) => {
      if (!row || row.version !== input.version) {
        throw new Error(
          `update_transaction: stale version — read ${input.version}, row is at ${row?.version}`,
        );
      }
      row = {
        ...row,
        ...("payee" in input.patch ? { payee: input.patch.payee ?? row.payee } : {}),
        ...("categoryId" in input.patch ? { categoryId: input.patch.categoryId ?? null } : {}),
        version: row.version + 1,
      };
    });
    const deleteTransaction = vi.fn<PhoneLedgerPort["deleteTransaction"]>((input) => {
      if (!row || row.version !== input.version) {
        throw new Error(
          `delete_transaction: stale version — read ${input.version}, row is at ${row?.version}`,
        );
      }
      row = null;
    });
    const setTransactionLines = vi.fn<PhoneLedgerPort["setTransactionLines"]>((input) => {
      if (!row || row.version !== input.version) {
        throw new Error(
          `set_transaction_lines: stale version — read ${input.version}, row is at ${row?.version}`,
        );
      }
      const sum = input.lines.reduce(
        (acc, line) => money.add(acc, line.amount),
        money.toMoney("0"),
      );
      if (input.lines.length > 0 && !money.eq(sum, money.abs(row.amount))) {
        throw new Error(`set_transaction_lines: lines sum to ${sum}, the transaction is 48.90`);
      }
      row = {
        ...row,
        lines: input.lines.map((line) => ({
          id: line.id,
          description: line.description,
          amount: line.amount,
          categoryId: line.categoryId ?? null,
          categoryName: null,
        })),
        version: row.version + 1,
      };
    });

    const port: PhoneLedgerPort = {
      listAccounts: () => [],
      listCurrencies: () => CURRENCIES,
      listGroups: () => [],
      listRecent: () => [],
      listCategories: () => [],
      listCategoryTree: () => [],
      listCounterparties: () => [],
      listPayeeHistory: () => [],
      listNetWorth: () => [],
      readPeriodSpend: () => [],
      listUnsettledClearing: () => [],
      getTransaction,
      createAccount: vi.fn(),
      createTransaction: vi.fn(),
      createCategory: vi.fn(),
      updateTransaction,
      deleteTransaction,
      setTransactionLines,
      searchTransactions: () => ({
        rows: [],
        nextCursor: undefined,
        total: { count: 0, currencies: [] },
      }),
      categorizeBatch: () => undefined,
      updateAccount: () => undefined,
      archiveAccount: () => undefined,
      reconcileAccount: () => undefined,
      createGroup: () => undefined,
      createCounterparty: () => undefined,
      updateCounterparty: () => undefined,
      mergeCounterparties: () => undefined,
      unmergeCounterparties: () => undefined,
      recordDistinctCounterparties: () => undefined,
      settleDebt: () => ({ residual: money.toMoney("0"), overSettled: false }),
      balanceAsOf: () => money.toMoney("0"),
      readRate: vi.fn(() => null),
      readCoverage: vi.fn(() => []),
      listFxRates: vi.fn(() => []),
      addCurrency: vi.fn(),
      archiveCurrency: vi.fn(),
      setRateSource: vi.fn(),
      setPinned: vi.fn(),
      changePivot: vi.fn(),
      setManualRate: vi.fn(() => ({ written: 0, replacedManual: 0 })),
      clearManualRate: vi.fn(() => ({ deleted: 0 })),
      reset: vi.fn(),
    };
    const controller = createPhoneLedger(port, {
      capture: () => ({
        date: accountingDate("2026-08-06"),
        timeZone: "Europe/Warsaw",
        offsetMinutes: 120,
        at: new Date("2026-08-06T10:00:00Z"),
      }),
      id: <Table extends IdTable>() => id<Table>("00000000-0000-4000-8000-000000000099"),
    });
    return {
      controller,
      getTransaction,
      updateTransaction,
      deleteTransaction,
      setTransactionLines,
    };
  }

  it("getTransaction reads through the port, unmodified", () => {
    const { controller, getTransaction } = detailHarness();
    const result = controller.getTransaction(TXN);
    expect(result?.payee).toBe("Café A");
    expect(getTransaction).toHaveBeenCalledWith(TXN);
  });

  it("updateTransaction patches with the version it was given, and refreshes on success", () => {
    const { controller, updateTransaction } = detailHarness();
    const result = controller.updateTransaction(TXN, 1, { payee: "Café A · Downtown" });
    expect(idOf(result)).toBe(TXN);
    expect(updateTransaction.mock.calls[0]?.[0]).toMatchObject({
      id: TXN,
      version: 1,
      patch: { payee: "Café A · Downtown" },
    });
    expect(controller.getTransaction(TXN)?.payee).toBe("Café A · Downtown");
  });

  /**
   * The plan's own case: a stale version lands at form level with
   * `transactions.changedElsewhere`. The row moves under the writer first
   * (a real save, bumping it to version 2), then the screen's own stale read
   * (version 1) is what gets refused — `version: 0` would never reach the
   * port at all, since the input schema itself refuses a non-positive one.
   */
  it("a stale version on update reaches fieldErrors with transactions.changedElsewhere", () => {
    const { controller } = detailHarness();
    controller.updateTransaction(TXN, 1, { payee: "Café A · Downtown" });

    const result = controller.updateTransaction(TXN, 1, { payee: "Someone else's edit" });

    expect("fieldErrors" in result && result.fieldErrors).toEqual([
      {
        path: "",
        message: "update_transaction: stale version — read 1, row is at 2",
        messageKey: "transactions.changedElsewhere",
      },
    ]);
  });

  it("deleteTransaction succeeds with the version it was given", () => {
    const { controller } = detailHarness();
    const result = controller.deleteTransaction(TXN, 1);
    expect(idOf(result)).toBe(TXN);
    expect(controller.getTransaction(TXN)).toBeNull();
  });

  it("a stale version on delete reaches fieldErrors, not a throw", () => {
    const { controller } = detailHarness();
    controller.updateTransaction(TXN, 1, { payee: "Café A · Downtown" });

    const result = controller.deleteTransaction(TXN, 1);

    expect("fieldErrors" in result && result.fieldErrors[0]?.messageKey).toBe(
      "transactions.changedElsewhere",
    );
  });

  it("setTransactionLines saves a set that sums to the transaction's own amount", () => {
    const { controller } = detailHarness();
    const result = controller.setTransactionLines(TXN, 1, [
      {
        id: "11111111-1111-4111-8111-111111111111",
        description: "Groceries",
        amount: "48.90",
      },
    ]);
    expect(idOf(result)).toBe(TXN);
    expect(controller.getTransaction(TXN)?.lines).toMatchObject([{ description: "Groceries" }]);
  });

  /** The plan's other named case: a lines sum mismatch reaches fieldErrors too. */
  it("a lines sum mismatch reaches fieldErrors, plain text, no messageKey", () => {
    const { controller } = detailHarness();
    const result = controller.setTransactionLines(TXN, 1, [
      {
        id: "11111111-1111-4111-8111-111111111111",
        description: "Groceries",
        amount: "10.00",
      },
    ]);
    expect("fieldErrors" in result && result.fieldErrors).toEqual([
      {
        path: "",
        message: "set_transaction_lines: lines sum to 10.00000000, the transaction is 48.90",
      },
    ]);
  });
});

describe("phone ledger controller — counterparties and settlement", () => {
  const NINA = id<"counterparties">("11111111-1111-4111-8111-111111111111");
  const MAREK = id<"counterparties">("22222222-2222-4222-8222-222222222222");

  function counterpartyHarness() {
    let counterparties: PhoneCounterparty[] = [
      { id: NINA, name: "Nina", kind: "person", settlementCurrency: null, archived: false },
      { id: MAREK, name: "Marek", kind: "person", settlementCurrency: null, archived: false },
    ];
    let version = 1;

    const createCounterparty = vi.fn<PhoneLedgerPort["createCounterparty"]>((input) => {
      const collision = counterparties.find(
        (c) => c.name.trim().toLowerCase() === input.name.trim().toLowerCase(),
      );
      if (collision) {
        throw new Error(
          `create_counterparty: "${input.name}" collides with existing counterparty "${collision.name}" (${collision.id}) — counterparties_name_uq`,
        );
      }
      counterparties = [
        ...counterparties,
        {
          id: input.id,
          name: input.name,
          kind: input.kind,
          settlementCurrency: input.settlementCurrency,
          archived: false,
        },
      ];
    });
    const updateCounterparty = vi.fn<PhoneLedgerPort["updateCounterparty"]>((input) => {
      if (input.version !== version) {
        throw new Error(
          `update_counterparty: stale version — read ${input.version}, row is at ${version}`,
        );
      }
      if (input.patch.name !== undefined) {
        const collision = counterparties.find(
          (c) =>
            c.id !== input.id &&
            c.name.trim().toLowerCase() === (input.patch.name ?? "").trim().toLowerCase(),
        );
        if (collision) {
          throw new Error(
            `update_counterparty: "${input.patch.name}" collides with existing counterparty "${collision.name}" (${collision.id}) — counterparties_name_uq`,
          );
        }
      }
      version += 1;
      counterparties = counterparties.map((c) =>
        c.id === input.id
          ? {
              ...c,
              name: input.patch.name ?? c.name,
              kind: input.patch.kind ?? c.kind,
              settlementCurrency:
                input.patch.settlementCurrency === undefined
                  ? c.settlementCurrency
                  : input.patch.settlementCurrency,
              archived: input.patch.archived ?? c.archived,
            }
          : c,
      );
    });
    const mergeCounterparties = vi.fn<PhoneLedgerPort["mergeCounterparties"]>(() => undefined);
    const unmergeCounterparties = vi.fn<PhoneLedgerPort["unmergeCounterparties"]>(() => undefined);
    const recordDistinctCounterparties = vi.fn<PhoneLedgerPort["recordDistinctCounterparties"]>(
      () => undefined,
    );
    const settleDebt = vi.fn<PhoneLedgerPort["settleDebt"]>((input) => {
      if (money.dec(input.discharges.amount).gt("100")) {
        throw new Error(`settle_debt: nothing to settle in ${input.discharges.currency}`);
      }
      return { residual: money.toMoney("-70"), overSettled: false };
    });
    // `includeArchived` threaded through, mirroring `readCounterparties`'
    // own default — the fixture is the port, so it filters the way the
    // replica reader does rather than leaving that to the controller alone.
    const listCounterparties = vi.fn<PhoneLedgerPort["listCounterparties"]>((options) =>
      options?.includeArchived ? counterparties : counterparties.filter((c) => !c.archived),
    );

    const port: PhoneLedgerPort = {
      listAccounts: () => [],
      listCurrencies: () => [],
      listGroups: () => [],
      listRecent: () => [],
      listCategories: () => [],
      listCategoryTree: () => [],
      listCounterparties,
      listNetWorth: () => [],
      readPeriodSpend: () => [],
      listUnsettledClearing: () => [],
      balanceAsOf: vi.fn(),
      searchTransactions: () => ({
        rows: [],
        nextCursor: undefined,
        total: { count: 0, currencies: [] },
      }),
      categorizeBatch: () => undefined,
      createAccount: vi.fn(),
      createTransaction: vi.fn(),
      createCategory: vi.fn(),
      getTransaction: vi.fn(() => null),
      updateTransaction: vi.fn(),
      deleteTransaction: vi.fn(),
      setTransactionLines: vi.fn(),
      updateAccount: vi.fn(),
      archiveAccount: vi.fn(),
      reconcileAccount: vi.fn(),
      createGroup: vi.fn(),
      createCounterparty,
      updateCounterparty,
      mergeCounterparties,
      unmergeCounterparties,
      recordDistinctCounterparties,
      settleDebt,
      readRate: vi.fn(() => null),
      readCoverage: vi.fn(() => []),
      listFxRates: vi.fn(() => []),
      addCurrency: vi.fn(),
      archiveCurrency: vi.fn(),
      setRateSource: vi.fn(),
      setPinned: vi.fn(),
      changePivot: vi.fn(),
      setManualRate: vi.fn(() => ({ written: 0, replacedManual: 0 })),
      clearManualRate: vi.fn(() => ({ deleted: 0 })),
      listPayeeHistory: vi.fn(() => []),
      reset: vi.fn(),
    };

    const controller = createPhoneLedger(port, {
      capture: () => ({
        date: accountingDate("2026-08-23"),
        timeZone: "Europe/Warsaw",
        offsetMinutes: 120,
        at: new Date("2026-08-23T10:00:00Z"),
      }),
      id: <Table extends IdTable>() => id<Table>("00000000-0000-4000-8000-000000000099"),
    });

    return {
      controller,
      createCounterparty,
      updateCounterparty,
      mergeCounterparties,
      unmergeCounterparties,
      recordDistinctCounterparties,
      settleDebt,
      listCounterparties,
    };
  }

  it("creates a counterparty and it appears in the list", () => {
    const { controller } = counterpartyHarness();

    const result = controller.createCounterparty({
      name: "Ola",
      kind: "person",
      settlementCurrency: null,
      contact: null,
      note: "",
    });

    expect("id" in result).toBe(true);
    expect(controller.getSnapshot().counterparties.map((c) => c.name)).toContain("Ola");
  });

  it("refuses a folded-name collision, on the name field", () => {
    const { controller } = counterpartyHarness();

    const result = controller.createCounterparty({
      name: "  NINA  ",
      kind: "person",
      settlementCurrency: null,
      contact: null,
      note: "",
    });

    expect("fieldErrors" in result && result.fieldErrors).toEqual([
      {
        path: "name",
        message: expect.stringContaining("collides with existing counterparty"),
        messageKey: "counterparties.nameCollision",
      },
    ]);
  });

  it("refuses a stale version on update, with the shared messageKey", () => {
    const { controller } = counterpartyHarness();

    const result = controller.updateCounterparty({ id: NINA, version: 999, patch: { note: "x" } });

    expect("fieldErrors" in result && result.fieldErrors).toEqual([
      {
        path: "version",
        message: expect.stringContaining("stale version"),
        messageKey: "counterparties.staleVersion",
      },
    ]);
  });

  it("refuses renaming into a folded-name collision, on the name field", () => {
    const { controller } = counterpartyHarness();

    const result = controller.updateCounterparty({
      id: MAREK,
      version: 1,
      patch: { name: "nina" },
    });

    expect("fieldErrors" in result && result.fieldErrors).toEqual([
      {
        path: "name",
        message: expect.stringContaining('collides with existing counterparty "Nina"'),
        messageKey: "counterparties.nameCollision",
      },
    ]);
  });

  it("merges, unmerges, and records a distinct pair — the port is called with the parsed shape", () => {
    const { controller, mergeCounterparties, unmergeCounterparties, recordDistinctCounterparties } =
      counterpartyHarness();

    const merged = controller.mergeCounterparties({ winnerId: NINA, loserId: MAREK });
    expect("id" in merged).toBe(true);
    expect(mergeCounterparties).toHaveBeenCalledWith(
      expect.objectContaining({ winnerId: NINA, loserId: MAREK }),
      expect.anything(),
    );

    if (!("id" in merged)) throw new Error("expected a merge id");
    const unmerged = controller.unmergeCounterparties({ mergeId: merged.id });
    expect("id" in unmerged).toBe(true);
    expect(unmergeCounterparties).toHaveBeenCalledWith(
      expect.objectContaining({ mergeId: merged.id }),
      expect.anything(),
    );

    const distinct = controller.recordDistinctCounterparties({ aId: NINA, bId: MAREK });
    expect("aId" in distinct).toBe(true);
    expect(recordDistinctCounterparties).toHaveBeenCalledWith(
      expect.objectContaining({ aId: NINA, bId: MAREK }),
      expect.anything(),
    );
  });

  describe("loadArchivedCounterparties", () => {
    it("is empty until asked, then carries archived counterparties apart from the active list", () => {
      const { controller, listCounterparties } = counterpartyHarness();
      controller.updateCounterparty({ id: MAREK, version: 1, patch: { archived: true } });

      expect(controller.getSnapshot().archivedCounterparties).toEqual([]);
      expect(controller.getSnapshot().counterparties.map((c) => c.id)).toEqual([NINA]);
      expect(listCounterparties).toHaveBeenLastCalledWith();

      controller.loadArchivedCounterparties();

      expect(listCounterparties).toHaveBeenLastCalledWith({ includeArchived: true });
      expect(controller.getSnapshot().archivedCounterparties.map((c) => c.id)).toEqual([MAREK]);
      expect(controller.getSnapshot().counterparties.map((c) => c.id)).toEqual([NINA]);
    });
  });

  it("settle_debt: the residual and overSettled come from the port, never derived locally", () => {
    const { controller } = counterpartyHarness();

    const result = controller.settleDebt({
      counterpartyId: NINA,
      accountId: "33333333-3333-4333-8333-333333333333",
      date: "2026-08-04",
      amount: "50",
      currency: "EUR",
      dischargesCurrency: "EUR",
      dischargesAmount: "50",
      note: "",
      categoryId: null,
    });

    expect(result).toEqual(
      expect.objectContaining({ residual: money.toMoney("-70"), overSettled: false }),
    );
  });

  it("settle_debt: a zero balance refuses on the discharges field", () => {
    const { controller } = counterpartyHarness();

    const result = controller.settleDebt({
      counterpartyId: NINA,
      accountId: "33333333-3333-4333-8333-333333333333",
      date: "2026-08-04",
      amount: "150",
      currency: "EUR",
      dischargesCurrency: "EUR",
      dischargesAmount: "150",
      note: "",
      categoryId: null,
    });

    expect("fieldErrors" in result && result.fieldErrors).toEqual([
      {
        path: "discharges.currency",
        message: expect.stringContaining("nothing to settle"),
        messageKey: "settleDebt.nothingToSettle",
      },
    ]);
  });

  /*
   * H — an executor throw this controller does not recognise must still
   * surface as a form-level `fieldErrors` entry, never rethrown past the
   * controller (finding 2: one shape for all six counterparty/settlement
   * writes, `accountWriteRefusal`'s own contract).
   */
  it("createCounterparty: an unrecognised refusal reaches fieldErrors, not a throw", () => {
    const { controller, createCounterparty } = counterpartyHarness();
    createCounterparty.mockImplementationOnce(() => {
      throw new Error("create_counterparty: the replica insert returned no row");
    });

    const result = controller.createCounterparty({
      name: "Ola",
      kind: "person",
      settlementCurrency: null,
      contact: null,
      note: "",
    });

    expect("fieldErrors" in result && result.fieldErrors).toEqual([
      { path: "", message: "create_counterparty: the replica insert returned no row" },
    ]);
  });

  it("updateCounterparty: an unrecognised refusal reaches fieldErrors, not a throw", () => {
    const { controller, updateCounterparty } = counterpartyHarness();
    updateCounterparty.mockImplementationOnce(() => {
      throw new Error("update_counterparty: the row changed between read and write");
    });

    const result = controller.updateCounterparty({ id: NINA, version: 1, patch: { note: "x" } });

    expect("fieldErrors" in result && result.fieldErrors).toEqual([
      { path: "", message: "update_counterparty: the row changed between read and write" },
    ]);
  });

  it("mergeCounterparties: an unrecognised refusal reaches fieldErrors, not a throw", () => {
    const { controller, mergeCounterparties } = counterpartyHarness();
    mergeCounterparties.mockImplementationOnce(() => {
      throw new Error("merge_counterparties: the merge insert returned no row");
    });

    const result = controller.mergeCounterparties({ winnerId: NINA, loserId: MAREK });

    expect("fieldErrors" in result && result.fieldErrors).toEqual([
      { path: "", message: "merge_counterparties: the merge insert returned no row" },
    ]);
  });

  it("unmergeCounterparties: an unrecognised refusal reaches fieldErrors, not a throw", () => {
    const { controller, unmergeCounterparties } = counterpartyHarness();
    unmergeCounterparties.mockImplementationOnce(() => {
      throw new Error("unmerge_counterparties: the merge row changed between read and write");
    });

    const result = controller.unmergeCounterparties({
      mergeId: "cccccccc-cccc-4ccc-8ccc-cccccccccccc",
    });

    expect("fieldErrors" in result && result.fieldErrors).toEqual([
      { path: "", message: "unmerge_counterparties: the merge row changed between read and write" },
    ]);
  });

  it("recordDistinctCounterparties: an unrecognised refusal reaches fieldErrors, not a throw", () => {
    const { controller, recordDistinctCounterparties } = counterpartyHarness();
    recordDistinctCounterparties.mockImplementationOnce(() => {
      throw new Error("record_distinct_counterparties: boom");
    });

    const result = controller.recordDistinctCounterparties({ aId: NINA, bId: MAREK });

    expect("fieldErrors" in result && result.fieldErrors).toEqual([
      { path: "", message: "record_distinct_counterparties: boom" },
    ]);
  });

  it("settleDebt: an unrecognised refusal reaches fieldErrors, not a throw", () => {
    const { controller, settleDebt } = counterpartyHarness();
    settleDebt.mockImplementationOnce(() => {
      throw new Error("settle_debt: the row changed between insert and the debt-fields update");
    });

    const result = controller.settleDebt({
      counterpartyId: NINA,
      accountId: "33333333-3333-4333-8333-333333333333",
      date: "2026-08-04",
      amount: "50",
      currency: "EUR",
      dischargesCurrency: "EUR",
      dischargesAmount: "50",
      note: "",
      categoryId: null,
    });

    expect("fieldErrors" in result && result.fieldErrors).toEqual([
      {
        path: "",
        message: "settle_debt: the row changed between insert and the debt-fields update",
      },
    ]);
  });
});

/**
 * §6.6's own table, through the controller's on-demand `listCounterpartyBalances`
 * — a fixture that accrues the four events in turn (lend, they repay, you
 * borrow, you repay), yielding `+200`, `0`, `−200`, `0` (the plan's own
 * board-card case for E1's task 6).
 */
describe("phone ledger controller — listCounterpartyBalances (§6.6)", () => {
  const PLN = currencyCode("PLN");
  const NINA = id<"counterparties">("77777777-7777-4777-8777-777777777777");
  const TODAY = accountingDate("2026-09-10");

  function row(balance: string): readonly PhoneCounterpartyBalance[] {
    return [
      {
        counterpartyId: NINA,
        name: "Nina",
        kind: "person",
        settlementCurrency: null,
        currency: PLN,
        decimals: 2,
        balance: money.toMoney(balance),
        ageDays: null,
        bucket: null,
      },
    ];
  }

  function balancesHarness() {
    const listCounterpartyBalances = vi.fn<PhoneLedgerPort["listCounterpartyBalances"]>();
    const port: PhoneLedgerPort = {
      listAccounts: () => [],
      listCurrencies: () => [],
      listGroups: () => [],
      listRecent: () => [],
      listCategories: () => [],
      listCategoryTree: () => [],
      listCounterparties: () => [],
      listNetWorth: () => [],
      readPeriodSpend: () => [],
      listUnsettledClearing: () => [],
      listCounterpartyBalances,
      balanceAsOf: vi.fn(),
      searchTransactions: () => ({
        rows: [],
        nextCursor: undefined,
        total: { count: 0, currencies: [] },
      }),
      categorizeBatch: () => undefined,
      createAccount: vi.fn(),
      createTransaction: vi.fn(),
      createCategory: vi.fn(),
      getTransaction: vi.fn(() => null),
      updateTransaction: vi.fn(),
      deleteTransaction: vi.fn(),
      setTransactionLines: vi.fn(),
      updateAccount: vi.fn(),
      archiveAccount: vi.fn(),
      reconcileAccount: vi.fn(),
      createGroup: vi.fn(),
      reset: vi.fn(),
    };
    const controller = createPhoneLedger(port, {
      capture: () => ({
        date: TODAY,
        timeZone: "Europe/Warsaw",
        offsetMinutes: 120,
        at: new Date("2026-09-10T10:00:00Z"),
      }),
      id: <Table extends IdTable>() => id<Table>("00000000-0000-4000-8000-000000000001"),
    });
    return { controller, listCounterpartyBalances };
  }

  it("lend 200 · they repay 200 · you borrow 200 · you repay 200 → +200, 0, −200, 0", () => {
    const { controller, listCounterpartyBalances } = balancesHarness();
    listCounterpartyBalances
      .mockReturnValueOnce(row("200.00000000"))
      .mockReturnValueOnce(row("0.00000000"))
      .mockReturnValueOnce(row("-200.00000000"))
      .mockReturnValueOnce(row("0.00000000"));

    expect(controller.listCounterpartyBalances(TODAY)[0]?.balance).toBe("200.00000000");
    expect(controller.listCounterpartyBalances(TODAY)[0]?.balance).toBe("0.00000000");
    expect(controller.listCounterpartyBalances(TODAY)[0]?.balance).toBe("-200.00000000");
    expect(controller.listCounterpartyBalances(TODAY)[0]?.balance).toBe("0.00000000");
    expect(listCounterpartyBalances).toHaveBeenCalledTimes(4);
    expect(listCounterpartyBalances).toHaveBeenCalledWith(TODAY);
  });
});
