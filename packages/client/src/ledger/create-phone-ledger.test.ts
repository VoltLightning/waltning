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
  type PhoneLedgerPort,
  type PhoneRecentTransaction,
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
  };
}

function harness(diagnostics?: (event: object) => void) {
  let accounts: PhoneAccount[] = [];
  let recent: PhoneRecentTransaction[] = [];
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
      },
    ];
  });
  const createTransaction = vi.fn<PhoneLedgerPort["createTransaction"]>((input) => {
    const account = accounts.find((candidate) => candidate.id === input.accountId);
    if (!account) throw new Error("fixture account missing");
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
  const reset = vi.fn(() => {
    accounts = [];
    recent = [];
  });
  const port: PhoneLedgerPort = {
    listAccounts: () => accounts,
    listCurrencies: () => CURRENCIES,
    listGroups: () => [],
    listRecent: (limit) => recent.slice(0, limit),
    listCategories: () => [],
    listCategoryTree: () => [],
    listCounterparties: () => [],
    listNetWorth: () => [],
    readPeriodSpend: () => [],
    listUnsettledClearing: () => [],
    searchTransactions: () => ({
      rows: [],
      nextCursor: undefined,
      total: { count: 0, currencies: [] },
    }),
    categorizeBatch: () => undefined,
    createAccount,
    createTransaction,
    createCategory: vi.fn(),
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
  return { controller, capture, createAccount, createTransaction, reset };
}

describe("phone ledger controller", () => {
  it("starts with no accounts, no subtotals, and no Recent", () => {
    const { controller } = harness();
    expect(controller.getSnapshot()).toEqual({
      accounts: [],
      currencies: CURRENCIES,
      groups: [],
      recent: [],
      categories: [],
      categoryTree: [],
      counterparties: [],
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
      listNetWorth: () => [],
      readPeriodSpend: () => [],
      listUnsettledClearing: () => [],
      searchTransactions: () => ({
        rows: [],
        nextCursor: undefined,
        total: { count: 0, currencies: [] },
      }),
      categorizeBatch: () => undefined,
      createAccount: vi.fn(),
      createTransaction: vi.fn(),
      createCategory: vi.fn(),
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
      listNetWorth: () => [],
      readPeriodSpend: () => [],
      listUnsettledClearing: () => [],
      searchTransactions: () => ({
        rows: [],
        nextCursor: undefined,
        total: { count: 0, currencies: [] },
      }),
      categorizeBatch: () => undefined,
      createAccount: vi.fn(),
      createTransaction: vi.fn(),
      createCategory: vi.fn(),
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
      listNetWorth: () => [],
      readPeriodSpend: () => [],
      listUnsettledClearing: () => [],
      searchTransactions: () => ({
        rows: [],
        nextCursor: undefined,
        total: { count: 0, currencies: [] },
      }),
      categorizeBatch: () => undefined,
      createAccount: vi.fn(),
      createTransaction: vi.fn(),
      createCategory: vi.fn(),
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
      listNetWorth: () => [],
      readPeriodSpend: () => [],
      listUnsettledClearing: () => [],
      searchTransactions: () => ({
        rows: [],
        nextCursor: undefined,
        total: { count: 0, currencies: [] },
      }),
      categorizeBatch: () => undefined,
      createAccount: vi.fn(),
      createTransaction: vi.fn(),
      createCategory,
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
