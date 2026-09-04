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
  type PhoneFullCategoryNode,
  type PhoneLedgerPort,
  type PhoneRecentTransaction,
  type PhoneTransactionDetail,
  type QuickAddDraft,
} from "./create-phone-ledger.ts";

/** A full-tree category node fixture, `version: 1` unless a test bumps it. */
function categoryNode(
  overrides: Partial<Omit<PhoneFullCategoryNode, "id">> & {
    id: string;
    name: string;
    kind: "income" | "expense";
  },
): PhoneFullCategoryNode {
  return {
    parentId: null,
    isLeaf: true,
    archived: false,
    sort: 0,
    depth: 0,
    version: 1,
    ...overrides,
    id: id<"categories">(overrides.id),
  };
}

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

function harness(
  diagnostics?: (event: object) => void,
  options?: {
    categoryTree?: readonly PhoneFullCategoryNode[];
    categoryUsage?: ReadonlyMap<Id<"categories">, number>;
  },
) {
  let accounts: PhoneAccount[] = [];
  let recent: PhoneRecentTransaction[] = [];
  let fullCategoryTree: readonly PhoneFullCategoryNode[] = options?.categoryTree ?? [];
  const categoryUsage = options?.categoryUsage ?? new Map();
  const bump = (categoryId: Id<"categories">, patch: Partial<PhoneFullCategoryNode>) => {
    fullCategoryTree = fullCategoryTree.map((node) =>
      node.id === categoryId ? { ...node, ...patch, version: node.version + 1 } : node,
    );
  };
  const renameCategory = vi.fn<PhoneLedgerPort["renameCategory"]>((input) =>
    bump(input.id, { name: input.name }),
  );
  const reparentCategory = vi.fn<PhoneLedgerPort["reparentCategory"]>((input) =>
    bump(input.id, { parentId: input.parentId }),
  );
  const convertLeafGroup = vi.fn<PhoneLedgerPort["convertLeafGroup"]>((input) =>
    bump(input.id, { isLeaf: input.to === "leaf" }),
  );
  const mergeCategories = vi.fn<PhoneLedgerPort["mergeCategories"]>((input) =>
    bump(input.loserId, { archived: true }),
  );
  const archiveCategory = vi.fn<PhoneLedgerPort["archiveCategory"]>((input) =>
    bump(input.id, { archived: true }),
  );
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
    listFullCategoryTree: () => fullCategoryTree,
    listCategoryUsage: () => categoryUsage,
    readCategoryReferenceCounts: () => ({ transactions: 0, lines: 0, rules: 0 }),
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
    getTransaction: vi.fn(() => null),
    updateTransaction: vi.fn(),
    deleteTransaction: vi.fn(),
    setTransactionLines: vi.fn(),
    renameCategory,
    reparentCategory,
    convertLeafGroup,
    mergeCategories,
    archiveCategory,
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
    renameCategory,
    reparentCategory,
    convertLeafGroup,
    mergeCategories,
    archiveCategory,
    reset,
  };
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
      fullCategoryTree: [],
      categoryUsage: new Map(),
      categoryCollisions: [],
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
      listFullCategoryTree: () => [],
      listCategoryUsage: () => new Map(),
      readCategoryReferenceCounts: () => ({ transactions: 0, lines: 0, rules: 0 }),
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
      getTransaction: vi.fn(() => null),
      updateTransaction: vi.fn(),
      deleteTransaction: vi.fn(),
      setTransactionLines: vi.fn(),
      renameCategory: vi.fn(),
      reparentCategory: vi.fn(),
      convertLeafGroup: vi.fn(),
      mergeCategories: vi.fn(),
      archiveCategory: vi.fn(),
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
      listFullCategoryTree: () => [],
      listCategoryUsage: () => new Map(),
      readCategoryReferenceCounts: () => ({ transactions: 0, lines: 0, rules: 0 }),
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
      getTransaction: vi.fn(() => null),
      updateTransaction: vi.fn(),
      deleteTransaction: vi.fn(),
      setTransactionLines: vi.fn(),
      renameCategory: vi.fn(),
      reparentCategory: vi.fn(),
      convertLeafGroup: vi.fn(),
      mergeCategories: vi.fn(),
      archiveCategory: vi.fn(),
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
      listFullCategoryTree: () => [],
      listCategoryUsage: () => new Map(),
      readCategoryReferenceCounts: () => ({ transactions: 0, lines: 0, rules: 0 }),
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
      getTransaction: vi.fn(() => null),
      updateTransaction: vi.fn(),
      deleteTransaction: vi.fn(),
      setTransactionLines: vi.fn(),
      renameCategory: vi.fn(),
      reparentCategory: vi.fn(),
      convertLeafGroup: vi.fn(),
      mergeCategories: vi.fn(),
      archiveCategory: vi.fn(),
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
      listFullCategoryTree: () => [],
      listCategoryUsage: () => new Map(),
      readCategoryReferenceCounts: () => ({ transactions: 0, lines: 0, rules: 0 }),
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
      getTransaction: vi.fn(() => null),
      updateTransaction: vi.fn(),
      deleteTransaction: vi.fn(),
      setTransactionLines: vi.fn(),
      renameCategory: vi.fn(),
      reparentCategory: vi.fn(),
      convertLeafGroup: vi.fn(),
      mergeCategories: vi.fn(),
      archiveCategory: vi.fn(),
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
      listFullCategoryTree: () => [],
      listCategoryUsage: () => new Map(),
      readCategoryReferenceCounts: () => ({ transactions: 0, lines: 0, rules: 0 }),
      renameCategory: () => undefined,
      reparentCategory: () => undefined,
      convertLeafGroup: () => undefined,
      mergeCategories: () => undefined,
      archiveCategory: () => undefined,
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

describe("category writes", () => {
  const FOOD_GROUP = "22222222-2222-4222-8222-222222222222";
  const GROCERIES = "33333333-3333-4333-8333-333333333333";
  const EATING_OUT = "44444444-4444-4444-8444-444444444444";
  const INCOME_GROUP = "55555555-5555-4555-8555-555555555555";
  const SALARY = "66666666-6666-4666-8666-666666666666";

  const tree = () => [
    categoryNode({ id: FOOD_GROUP, name: "Food", kind: "expense", isLeaf: false }),
    categoryNode({ id: GROCERIES, name: "Groceries", kind: "expense", parentId: id(FOOD_GROUP) }),
    categoryNode({ id: EATING_OUT, name: "Eating out", kind: "expense", parentId: id(FOOD_GROUP) }),
    categoryNode({ id: INCOME_GROUP, name: "Earnings", kind: "income", isLeaf: false }),
    categoryNode({ id: SALARY, name: "Salary", kind: "income", parentId: id(INCOME_GROUP) }),
  ];

  describe("renameCategory", () => {
    it("propagates the new name and bumps the version on the port call", () => {
      const { controller, renameCategory } = harness(undefined, { categoryTree: tree() });

      const result = controller.renameCategory({ id: GROCERIES, name: "Groceries & household" });

      expect(idOf(result)).toBe(GROCERIES);
      expect(renameCategory.mock.calls[0]?.[0]).toMatchObject({
        id: GROCERIES,
        version: 1,
        name: "Groceries & household",
      });
      expect(controller.getSnapshot().fullCategoryTree.find((n) => n.id === GROCERIES)?.name).toBe(
        "Groceries & household",
      );
    });

    it("refuses a sibling collision before writing, naming the existing sibling", () => {
      const { controller, renameCategory } = harness(undefined, { categoryTree: tree() });

      const result = controller.renameCategory({ id: EATING_OUT, name: "groceries" });

      expect("fieldErrors" in result && result.fieldErrors).toEqual([
        { path: "name", message: '"Groceries" already exists here' },
      ]);
      expect(renameCategory).not.toHaveBeenCalled();
    });

    it("does not collide with itself when the name is unchanged", () => {
      const { controller } = harness(undefined, { categoryTree: tree() });
      const result = controller.renameCategory({ id: GROCERIES, name: "Groceries" });
      expect(idOf(result)).toBe(GROCERIES);
    });
  });

  describe("moveCategory", () => {
    it("moves a leaf to another group of the same kind", () => {
      const { controller, reparentCategory } = harness(undefined, {
        categoryTree: [
          ...tree(),
          categoryNode({
            id: "77777777-7777-4777-8777-777777777777",
            name: "Household",
            kind: "expense",
            isLeaf: false,
          }),
        ],
      });

      const result = controller.moveCategory({
        id: GROCERIES,
        parentId: "77777777-7777-4777-8777-777777777777",
      });

      expect(idOf(result)).toBe(GROCERIES);
      expect(reparentCategory.mock.calls[0]?.[0]).toMatchObject({
        id: GROCERIES,
        parentId: "77777777-7777-4777-8777-777777777777",
      });
    });

    it("refuses a leaf as the target — not a group", () => {
      const { controller, reparentCategory } = harness(undefined, { categoryTree: tree() });
      const result = controller.moveCategory({ id: GROCERIES, parentId: EATING_OUT });
      expect("fieldErrors" in result && result.fieldErrors).toEqual([
        { path: "parentId", message: '"Eating out" is not a group' },
      ]);
      expect(reparentCategory).not.toHaveBeenCalled();
    });

    /**
     * `TAXONOMY.md` R2 — mirrors `reparent-category.executor.ts`'s own
     * guard. The actions sheet never offers Move for a group, so this is
     * defense in depth against any other caller.
     */
    it("refuses moving a group anywhere but the root", () => {
      const { controller, reparentCategory } = harness(undefined, {
        categoryTree: [
          ...tree(),
          categoryNode({
            id: "88888888-8888-4888-8888-888888888888",
            name: "Household",
            kind: "expense",
            isLeaf: false,
          }),
        ],
      });

      const result = controller.moveCategory({
        id: FOOD_GROUP,
        parentId: "88888888-8888-4888-8888-888888888888",
      });

      expect("fieldErrors" in result && result.fieldErrors).toEqual([
        { path: "parentId", message: '"Food" is a group — a group may only sit at the root' },
      ]);
      expect(reparentCategory).not.toHaveBeenCalled();
    });

    it("refuses crossing kinds", () => {
      const { controller } = harness(undefined, { categoryTree: tree() });
      const result = controller.moveCategory({ id: SALARY, parentId: FOOD_GROUP });
      expect("fieldErrors" in result && result.fieldErrors).toEqual([
        { path: "parentId", message: '"Food" is a expense group — refused across kinds' },
      ]);
    });

    /**
     * The same scenario the old cycle test used — `FOOD_GROUP` moved onto
     * `GROCERIES` after `GROCERIES` becomes a group — now refuses at the R2
     * guard above (tested separately), before `wouldCycle` ever runs: only a
     * leaf reaches that check, matching `reparent-category.executor.ts`'s
     * own reasoning.
     */
    it("refuses the R2 way before it would ever reach the cycle check", () => {
      const { controller } = harness(undefined, {
        categoryTree: tree().map((node) =>
          node.id === GROCERIES ? { ...node, isLeaf: false } : node,
        ),
      });
      const result = controller.moveCategory({ id: FOOD_GROUP, parentId: GROCERIES });
      expect("fieldErrors" in result && result.fieldErrors).toEqual([
        { path: "parentId", message: '"Food" is a group — a group may only sit at the root' },
      ]);
    });
  });

  describe("convertCategory", () => {
    it("refuses converting to a group while a transaction uses it, naming the usage count", () => {
      const { controller, convertLeafGroup } = harness(undefined, {
        categoryTree: tree(),
        categoryUsage: new Map([[id(GROCERIES), 3]]),
      });

      const result = controller.convertCategory({ id: GROCERIES, to: "group" });

      expect("fieldErrors" in result && result.fieldErrors).toEqual([
        { path: "id", message: '3 transaction(s) use "Groceries" — recategorise or merge first' },
      ]);
      expect(convertLeafGroup).not.toHaveBeenCalled();
    });

    it("converts an unused leaf to a group", () => {
      const { controller } = harness(undefined, { categoryTree: tree() });
      const result = controller.convertCategory({ id: EATING_OUT, to: "group" });
      expect(idOf(result)).toBe(EATING_OUT);
      expect(
        controller.getSnapshot().fullCategoryTree.find((n) => n.id === EATING_OUT)?.isLeaf,
      ).toBe(false);
    });

    it("refuses converting a group with children to a leaf", () => {
      const { controller } = harness(undefined, { categoryTree: tree() });
      const result = controller.convertCategory({ id: FOOD_GROUP, to: "leaf" });
      expect("fieldErrors" in result && result.fieldErrors).toEqual([
        { path: "id", message: '"Food" has 2 categories inside it' },
      ]);
    });
  });

  describe("mergeCategories", () => {
    it("merges the loser into the winner and returns the winner's id", () => {
      const { controller, mergeCategories } = harness(undefined, { categoryTree: tree() });

      const result = controller.mergeCategories({ loserId: EATING_OUT, winnerId: GROCERIES });

      expect(idOf(result)).toBe(GROCERIES);
      expect(mergeCategories.mock.calls[0]?.[0]).toEqual({
        loserId: EATING_OUT,
        winnerId: GROCERIES,
      });
    });

    it("refuses a group on either side — only leaves hold transactions", () => {
      const { controller, mergeCategories } = harness(undefined, { categoryTree: tree() });
      const result = controller.mergeCategories({ loserId: FOOD_GROUP, winnerId: GROCERIES });
      expect("fieldErrors" in result && result.fieldErrors).toEqual([
        { path: "winnerId", message: "Only leaves hold transactions — refused on a group" },
      ]);
      expect(mergeCategories).not.toHaveBeenCalled();
    });

    it("refuses merging across kinds", () => {
      const { controller } = harness(undefined, { categoryTree: tree() });
      const result = controller.mergeCategories({ loserId: SALARY, winnerId: GROCERIES });
      expect("fieldErrors" in result && result.fieldErrors).toEqual([
        {
          path: "winnerId",
          message: '"Groceries" is expense, "Salary" is income — refused across kinds',
        },
      ]);
    });
  });

  describe("archiveCategory", () => {
    it("archives a leaf, even with transactions — the whole point", () => {
      const { controller, archiveCategory } = harness(undefined, {
        categoryTree: tree(),
        categoryUsage: new Map([[id(GROCERIES), 12]]),
      });

      const result = controller.archiveCategory({ id: GROCERIES });

      expect(idOf(result)).toBe(GROCERIES);
      expect(archiveCategory.mock.calls[0]?.[0]).toMatchObject({ id: GROCERIES, version: 1 });
    });

    it("refuses a group with unarchived children", () => {
      const { controller, archiveCategory } = harness(undefined, { categoryTree: tree() });
      const result = controller.archiveCategory({ id: FOOD_GROUP });
      expect("fieldErrors" in result && result.fieldErrors).toEqual([
        { path: "id", message: '"Food" has 2 unarchived categories inside it' },
      ]);
      expect(archiveCategory).not.toHaveBeenCalled();
    });

    it("refuses a category that is already archived", () => {
      const { controller } = harness(undefined, {
        categoryTree: tree().map((node) =>
          node.id === GROCERIES ? { ...node, archived: true } : node,
        ),
      });
      const result = controller.archiveCategory({ id: GROCERIES });
      expect("fieldErrors" in result && result.fieldErrors).toEqual([
        { path: "id", message: '"Groceries" is already archived' },
      ]);
    });
  });
});

describe("category collisions", () => {
  it("flags §9.2's own worked example — Groceries and Grocery, under different groups", () => {
    const { controller } = harness(undefined, {
      categoryTree: [
        categoryNode({
          id: "aaaaaaaa-0000-4000-8000-000000000001",
          name: "Groceries",
          kind: "expense",
        }),
        categoryNode({
          id: "aaaaaaaa-0000-4000-8000-000000000002",
          name: "Grocery",
          kind: "expense",
          parentId: id("bbbbbbbb-0000-4000-8000-000000000001"),
        }),
      ],
    });

    const collisions = controller.getSnapshot().categoryCollisions;
    expect(collisions).toHaveLength(1);
    expect(collisions[0]?.a.name).toBe("Groceries");
    expect(collisions[0]?.b.name).toBe("Grocery");
  });

  it("does not flag two unrelated names", () => {
    const { controller } = harness(undefined, {
      categoryTree: [
        categoryNode({
          id: "aaaaaaaa-0000-4000-8000-000000000001",
          name: "Groceries",
          kind: "expense",
        }),
        categoryNode({
          id: "aaaaaaaa-0000-4000-8000-000000000002",
          name: "Software",
          kind: "expense",
        }),
      ],
    });

    expect(controller.getSnapshot().categoryCollisions).toHaveLength(0);
  });

  it("never flags across kinds, a group, or an archived leaf", () => {
    const { controller } = harness(undefined, {
      categoryTree: [
        categoryNode({
          id: "aaaaaaaa-0000-4000-8000-000000000001",
          name: "Groceries",
          kind: "expense",
        }),
        categoryNode({
          id: "aaaaaaaa-0000-4000-8000-000000000002",
          name: "Grocery",
          kind: "income",
        }),
        categoryNode({
          id: "aaaaaaaa-0000-4000-8000-000000000003",
          name: "Grocery",
          kind: "expense",
          isLeaf: false,
        }),
        categoryNode({
          id: "aaaaaaaa-0000-4000-8000-000000000004",
          name: "Grocery",
          kind: "expense",
          archived: true,
        }),
      ],
    });

    expect(controller.getSnapshot().categoryCollisions).toHaveLength(0);
  });

  /**
   * A real false positive on the seeded taxonomy: `Taxi` and `Tax` are
   * unrelated (transport vs. financial — different groups, same kind), but
   * `jaccard(trigrams("taxi"), trigrams("tax"))` is `0.5` — over threshold —
   * purely because both names are short. A short string has few trigrams, so
   * sharing just its first two or three inflates the *ratio* without the two
   * names sharing much of anything structurally. `Groceries`/`Grocery` share
   * 6 actual trigrams; `Taxi`/`Tax` share 3.
   */
  it("does not flag Taxi and Tax — a short-name false positive", () => {
    const { controller } = harness(undefined, {
      categoryTree: [
        categoryNode({ id: "aaaaaaaa-0000-4000-8000-000000000001", name: "Taxi", kind: "expense" }),
        categoryNode({ id: "aaaaaaaa-0000-4000-8000-000000000002", name: "Tax", kind: "expense" }),
      ],
    });

    expect(controller.getSnapshot().categoryCollisions).toHaveLength(0);
  });

  /**
   * Every leaf `TAXONOMY.md` actually seeds (`packages/db/src/seed/data.ts`),
   * name and kind only. **Copied literally, not imported** —
   * `tests/architecture.test.ts` refuses any client package a path into
   * `packages/db`, by any route, so this list is duplicated rather than
   * shared; a seed change that renames or adds a leaf needs this list kept in
   * step, which is the cost of the boundary rather than a costless one. The
   * whole point of this test: the real 59-leaf taxonomy produces **zero**
   * collisions at this threshold, not just the two names picked for the tests
   * above.
   */
  it("finds zero collisions across the real seeded taxonomy", () => {
    const seededLeaves: { name: string; kind: "income" | "expense" }[] = [
      // Income
      { name: "Services", kind: "income" },
      { name: "Other revenue", kind: "income" },
      { name: "Salary", kind: "income" },
      { name: "Bonus & equity", kind: "income" },
      { name: "Investment returns", kind: "income" },
      { name: "Interest", kind: "income" },
      { name: "Gift received", kind: "income" },
      { name: "Refund", kind: "income" },
      { name: "Borrowed", kind: "income" },
      { name: "Repayment received", kind: "income" },
      { name: "Other inflow", kind: "income" },
      // Expense — Home
      { name: "Property purchase", kind: "expense" },
      { name: "Rent", kind: "expense" },
      { name: "Utilities", kind: "expense" },
      { name: "Furniture & appliances", kind: "expense" },
      { name: "Household supplies", kind: "expense" },
      { name: "Renovation & building", kind: "expense" },
      { name: "Plumbing", kind: "expense" },
      { name: "Electrical & network", kind: "expense" },
      { name: "Facade & exterior", kind: "expense" },
      { name: "Garden", kind: "expense" },
      // Food
      { name: "Groceries", kind: "expense" },
      { name: "Eating out", kind: "expense" },
      { name: "Delivery", kind: "expense" },
      { name: "Alcohol", kind: "expense" },
      // Transport
      { name: "Car", kind: "expense" },
      { name: "Taxi", kind: "expense" },
      { name: "Public transport", kind: "expense" },
      { name: "Fuel & parking", kind: "expense" },
      // Travel
      { name: "Flights & tickets", kind: "expense" },
      { name: "Accommodation", kind: "expense" },
      { name: "Travel food & activities", kind: "expense" },
      // Health
      { name: "Medical & dental", kind: "expense" },
      { name: "Pharmacy", kind: "expense" },
      { name: "Sport & fitness", kind: "expense" },
      { name: "Beauty & grooming", kind: "expense" },
      // Personal
      { name: "Clothing & shoes", kind: "expense" },
      { name: "Technology", kind: "expense" },
      { name: "Hobbies", kind: "expense" },
      { name: "Education", kind: "expense" },
      // Social
      { name: "Friends & going out", kind: "expense" },
      { name: "Gifts given", kind: "expense" },
      { name: "Celebrations", kind: "expense" },
      { name: "Entertainment", kind: "expense" },
      // Subscriptions
      { name: "Software & tools", kind: "expense" },
      { name: "Media & streaming", kind: "expense" },
      { name: "Mobile & internet", kind: "expense" },
      // Financial
      { name: "Tax", kind: "expense" },
      { name: "Bank fees & commission", kind: "expense" },
      { name: "Legal & professional", kind: "expense" },
      { name: "Insurance", kind: "expense" },
      // Business
      { name: "Accountant", kind: "expense" },
      { name: "Business services", kind: "expense" },
      { name: "ZUS & business tax", kind: "expense" },
      { name: "Business other", kind: "expense" },
      // Debt & giving
      { name: "Lent out", kind: "expense" },
      { name: "Repayment made", kind: "expense" },
      { name: "Charity", kind: "expense" },
      // Top-level
      { name: "Uncategorized", kind: "expense" },
    ];
    expect(seededLeaves).toHaveLength(59);

    const { controller } = harness(undefined, {
      categoryTree: seededLeaves.map((leaf, index) =>
        categoryNode({
          id: `cccccccc-0000-4000-${String(8000 + index).padStart(4, "0")}-000000000000`,
          name: leaf.name,
          kind: leaf.kind,
        }),
      ),
    });

    const collisions = controller.getSnapshot().categoryCollisions;
    expect(collisions.map((c) => `${c.a.name} <-> ${c.b.name}`)).toEqual([]);
  });
});
