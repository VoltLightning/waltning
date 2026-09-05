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
  type PhoneCategory,
  type PhoneCategoryNode,
  type PhoneCounterparty,
  type PhoneCounterpartyBalance,
  type PhoneFullCategoryNode,
  type PhoneGroup,
  type PhoneLedgerPort,
  type PhoneRecentTransaction,
  type PhoneTransactionDetail,
  type QuickAddDraft,
} from "./create-phone-ledger.ts";
import { basePort } from "./test-port.ts";

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
    externalId: null,
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
  {
    code: currencyCode("PLN"),
    name: "Polish Złoty",
    symbol: "zł",
    decimals: 2,
    capturable: true,
    isPivot: true,
  },
  {
    code: currencyCode("BYN"),
    name: "Belarusian Ruble",
    symbol: "Br",
    decimals: 2,
    capturable: true,
    isPivot: false,
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

function harness(
  diagnostics?: (event: object) => void,
  options?: {
    categoryTree?: readonly PhoneFullCategoryNode[];
    categoryUsage?: ReadonlyMap<Id<"categories">, number>;
    categories?: readonly PhoneCategory[];
  },
) {
  let accounts: PhoneAccount[] = [];
  let recent: PhoneRecentTransaction[] = [];
  let groups: PhoneGroup[] = [];
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
        brandKey: null,
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
    listCategories: () => options?.categories ?? [],
    listCategoryTree: () => [],
    listFullCategoryTree: () => fullCategoryTree,
    listCategoryUsage: () => categoryUsage,
    readCategoryReferenceCounts: () => ({ transactions: 0, lines: 0, rules: 0 }),
    listCounterparties: () => [],
    listPayeeHistory: () => [],
    listNetWorth: () => [],
    readPeriodSpend: () => [],
    readSpendByCategory: () => [],
    readIncomeVsExpense: () => [],
    readActiveDashboardLayout: () => null,
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
    getAuditLog: vi.fn<PhoneLedgerPort["getAuditLog"]>(() => ({
      status: "unavailable_on_device",
    })),
    updateTransaction: vi.fn(),
    deleteTransaction: vi.fn(),
    setTransactionLines: vi.fn(),
    updateAccount,
    archiveAccount,
    reconcileAccount,
    createGroup,
    readRate: vi.fn(() => null),
    readCrossRate: vi.fn(() => null),
    listCurrencySettings: () => [],
    readCoverage: vi.fn(() => []),
    listFxRates: vi.fn(() => []),
    addCurrency: vi.fn(),
    archiveCurrency: vi.fn(),
    setRateSource: vi.fn(),
    setPinned: vi.fn(),
    changePivot: vi.fn(() => ({ droppedDates: 0 })),
    setManualRate: vi.fn(() => ({ written: 0, replacedManual: 0 })),
    clearManualRate: vi.fn(() => ({ deleted: 0 })),
    updateCurrency: vi.fn(),
    createCounterparty: vi.fn(),
    updateCounterparty: vi.fn(),
    mergeCounterparties: vi.fn(),
    unmergeCounterparties: vi.fn(),
    recordDistinctCounterparties: vi.fn(),
    settleDebt: vi.fn(() => ({ residual: money.toMoney("0"), overSettled: false })),
    listCounterpartyBalances: vi.fn(() => []),
    renameCategory,
    reparentCategory,
    convertLeafGroup,
    mergeCategories,
    archiveCategory,
    listCounterpartyMerges: vi.fn(() => []),
    listDistinctCounterpartyPairs: vi.fn(() => []),
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
    /** The raw port — the FX methods have no fixture state of their own to assert through, so tests spy on this directly. */
    port,
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
      revision: 1,
      accounts: [],
      archivedAccounts: [],
      // Every account's ownership, archived included — present from the
      // first snapshot, empty here because the port has no accounts (L6).
      accountOwnership: new Map(),
      currencies: CURRENCIES,
      groups: [],
      recent: [],
      categories: [],
      categoryTree: [],
      fullCategoryTree: [],
      categoryUsage: new Map(),
      categoryCollisions: [],
      counterparties: [],
      archivedCounterparties: [],
      subtotals: [],
      netWorth: [],
      unsettledClearing: [],
      distinctCounterpartyPairs: [],
    });
  });

  /** H1/M2 — `revision` is the "at least one `refresh()` has completed" signal, and a write bumps it. */
  it("starts at revision 1 (the constructor's own refresh) and bumps on every write", () => {
    const { controller } = harness();
    expect(controller.getSnapshot().revision).toBe(1);
    controller.createAccount(minimalDraft("Bank A · PLN", PLN));
    expect(controller.getSnapshot().revision).toBe(2);
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
   * M1 — `accounts.opening_balance` had no client mirror at all — the
   * sharpest of the four columns `accounts_balance_scale_matches_currency`
   * covers (`0011_transaction_scale_and_category_kind.sql`), since it
   * shifts every balance computed from it, forever.
   */
  it("refuses an opening balance past the chosen currency's own scale", () => {
    const { controller, createAccount } = harness();

    const result = controller.createAccount({
      ...minimalDraft("Bank A · PLN", PLN),
      openingBalance: "48.905",
    });

    expect("fieldErrors" in result && result.fieldErrors).toEqual([
      {
        path: "openingBalance",
        message: expect.stringContaining("decimal places"),
        messageKey: "transactions.tooManyDecimals",
        params: { currency: "PLN", decimals: "2" },
      },
    ]);
    expect(createAccount).not.toHaveBeenCalled();
  });

  it("admits an opening balance at exactly the chosen currency's own scale", () => {
    const { controller, createAccount } = harness();

    const result = controller.createAccount({
      ...minimalDraft("Bank A · PLN", PLN),
      openingBalance: "48.90",
    });

    expect("id" in result).toBe(true);
    expect(createAccount).toHaveBeenCalledOnce();
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
    const port = basePort({
      listAccounts: () => [
        account("11111111-1111-4111-8111-111111111111", "Bank A · PLN", PLN, "10"),
        account("33333333-3333-4333-8333-333333333333", "Bank B · BYN", BYN, "40"),
        account("44444444-4444-4444-8444-444444444444", "Cash · PLN", PLN, "2.50"),
      ],
      listCurrencies: () => CURRENCIES,
    });

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
    const port = basePort({
      listAccounts: () => [
        account("33333333-3333-4333-8333-333333333333", "Bank B · BYN", BYN, "9000"),
        account("11111111-1111-4111-8111-111111111111", "Bank A · PLN", PLN, "1"),
      ],
      listCurrencies: () => CURRENCIES,
    });

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
    // H1a — the category has to be one the snapshot actually offers now: an
    // id absent from it is archived or gone, and the controller refuses it
    // rather than writing a row no picker could display.
    const incomeCategory: PhoneCategory = {
      id: id<"categories">("cccccccc-cccc-4ccc-8ccc-cccccccccccc"),
      name: "Freelance",
      kind: "income",
    };
    const { controller, createTransaction } = harness(undefined, {
      categories: [incomeCategory],
    });
    const accountId = idOf(controller.createAccount(minimalDraft("Bank A · PLN", PLN)));

    controller.createTransaction({
      type: "income",
      amount: "25",
      accountId,
      categoryId: incomeCategory.id,
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

  /**
   * L4 — a local `LocalRefusal` (`@waltning/ledger/scale.ts`'s own thrown
   * shape — `column`/`params` fields directly on the error, matched
   * structurally rather than by importing the class: this controller never
   * depends on `@waltning/ledger`, by design) routes to the field its own
   * `column` names, not by parsing `error.message` — the message here
   * carries the operation's own prefix (`"create_transaction: …"`), exactly
   * the shape a `^`-anchored regex against Postgres's own text could never
   * have matched, which was the actual bug this replaces.
   */
  it.each([
    ["amount_original", "amountOriginal"],
    ["to_amount", "toAmount"],
    ["fee", "fee"],
  ] as const)("routes a local scale refusal on %s to the %s field", (column, path) => {
    const { controller, createTransaction } = harness();
    const accountId = idOf(controller.createAccount(minimalDraft("Bank A · PLN", PLN)));
    createTransaction.mockImplementationOnce(() => {
      throw Object.assign(
        new Error(
          `create_transaction: ${column} 10.125 holds more decimal places than PLN allows (2)`,
        ),
        { name: "LocalRefusal", column, params: { currency: "PLN", decimals: "2" } },
      );
    });

    const result = controller.createTransaction(expenseDraft(accountId));

    expect("fieldErrors" in result && result.fieldErrors).toEqual([
      {
        path,
        message: expect.stringContaining(column),
        messageKey: "transactions.tooManyDecimals",
        params: { currency: "PLN", decimals: "2" },
      },
    ]);
  });

  /**
   * L4 — the other path: a server envelope (`DomainError`'s own
   * `ErrorDetails.column`, `apps/api/src/common/pg-errors.ts`'s M3 fix)
   * reaching this same controller shaped as `{ details: { column } }`,
   * carrying no `params` of its own (the server envelope has none to give) —
   * routed by the same `columnOf` read, falling back to the bare message
   * with no interpolation.
   */
  it("routes a server envelope's own column to the same field, with no params to interpolate", () => {
    const { controller, createTransaction } = harness();
    const accountId = idOf(controller.createAccount(minimalDraft("Bank A · PLN", PLN)));
    createTransaction.mockImplementationOnce(() => {
      throw Object.assign(
        new Error("amount_original 10.125 holds more decimal places than PLN allows (2)"),
        {
          details: { column: "amount_original" },
        },
      );
    });

    const result = controller.createTransaction(expenseDraft(accountId));

    expect("fieldErrors" in result && result.fieldErrors).toEqual([
      {
        path: "amountOriginal",
        message: expect.stringContaining("amount_original"),
      },
    ]);
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
   * #116 review, L2 — a `LocalDeferral` out of the port is a *saved* outcome
   * (`write.ts` commits the outbox entry before `apply` ever runs), never a
   * refusal. Before this fix it reached `fieldErrors` the same as a genuine
   * refusal, which left the caller unable to tell "saved, not yet valued"
   * from "not saved at all" — and a screen that kept the draft on a retry
   * would mint a second, genuinely new capture on top of the first.
   */
  it("reports a captured deferral as saved, with `deferred: true`, never as fieldErrors", () => {
    const { controller, createTransaction } = harness();
    const accountId = idOf(controller.createAccount(minimalDraft("Bank A · PLN", PLN)));
    createTransaction.mockImplementationOnce(() => {
      throw Object.assign(new Error("create_transaction: no last-known rate for PLN/CHF"), {
        name: "LocalDeferral",
      });
    });

    const result = controller.createTransaction(expenseDraft(accountId));

    expect(result).toHaveProperty("id");
    expect("deferred" in result && result.deferred).toBe(true);
    // Not a refusal: nothing named `fieldErrors` on this outcome.
    expect(result).not.toHaveProperty("fieldErrors");
  });

  /**
   * M4 — `money.toMoney` calls `Decimal`'s own constructor, which throws
   * `DecimalError` on a malformed string rather than returning one. This
   * controller used to call it directly on `draft.amount`, so a malformed
   * figure threw out of `createTransaction` instead of refusing.
   */
  it("refuses a malformed amount through fieldErrors, never throws", () => {
    const { controller, createTransaction } = harness();
    const accountId = idOf(controller.createAccount(minimalDraft("Bank A · PLN", PLN)));

    expect(() => controller.createTransaction(expenseDraft(accountId, "abc"))).not.toThrow();

    const result = controller.createTransaction(expenseDraft(accountId, "abc"));
    expect("fieldErrors" in result && result.fieldErrors).toEqual([
      { path: "amountOriginal", message: expect.any(String) },
    ]);
    expect(createTransaction).not.toHaveBeenCalled();
  });

  /**
   * L-b — a date that names no real day is refused here, and the refusal
   * arrives with a catalogue key rather than only Zod's English literal.
   *
   * The command bar's grammar refuses `2026-02-31` before it ever gets this
   * far (`capture/grammar.ts`'s `no_date`), which is where it *should* be
   * caught; this is the layer beneath, reached by any caller that names a
   * date directly, and it must refuse rather than write a day that is not on
   * a calendar.
   */
  it("refuses a calendar-invalid date, in a language the screen can render", () => {
    const { controller, createTransaction } = harness();
    const accountId = idOf(controller.createAccount(minimalDraft("Bank A · PLN", PLN)));

    const result = controller.createTransaction({
      ...expenseDraft(accountId),
      date: "2026-02-31",
    });
    expect("fieldErrors" in result && result.fieldErrors).toEqual([
      { path: "date", message: expect.any(String), messageKey: "transactions.badDate" },
    ]);
    expect(createTransaction).not.toHaveBeenCalled();
  });

  it("a real leap day is not refused — the check is the calendar, not the shape twice", () => {
    const { controller } = harness();
    const accountId = idOf(controller.createAccount(minimalDraft("Bank A · PLN", PLN)));

    const result = controller.createTransaction({
      ...expenseDraft(accountId),
      date: "2024-02-29",
    });
    expect(result).not.toHaveProperty("fieldErrors");
  });

  /**
   * H2 — `createTransactionInput` cannot know the account's currency, only
   * the controller has both in view. PLN holds 2 decimal places here; a
   * third digit is refused on `amountOriginal` before the write, never
   * silently truncated or stored past the account's own scale.
   */
  it("refuses an amount with more fractional digits than the account's currency holds", () => {
    const { controller, createTransaction } = harness();
    const accountId = idOf(controller.createAccount(minimalDraft("Bank A · PLN", PLN)));
    const result = controller.createTransaction(expenseDraft(accountId, "10.125"));
    expect("fieldErrors" in result && result.fieldErrors).toEqual([
      {
        path: "amountOriginal",
        message: expect.stringContaining("decimal places"),
        messageKey: "transactions.tooManyDecimals",
        params: { currency: PLN, decimals: "2" },
      },
    ]);
    expect(createTransaction).not.toHaveBeenCalled();
  });

  it("accepts an amount at exactly the account's own scale", () => {
    const { controller, createTransaction } = harness();
    const accountId = idOf(controller.createAccount(minimalDraft("Bank A · PLN", PLN)));
    const result = controller.createTransaction(expenseDraft(accountId, "10.12"));
    expect("id" in result).toBe(true);
    expect(createTransaction).toHaveBeenCalledOnce();
  });

  /**
   * H1-b — `createTransactionInput` has no category tree in view; the
   * controller does. Mirrors `transactions_category_kind_matches_type`
   * (`0011_transaction_scale_and_category_kind.sql`), the Postgres guarantee
   * this refusal exists so a write is never the first place it is caught.
   */
  it("refuses a categoryId whose kind disagrees with the transaction's type (H1-b)", () => {
    const expenseCategory: PhoneCategory = {
      id: id<"categories">("66666666-6666-4666-8666-666666666666"),
      name: "Eating out",
      kind: "expense",
    };
    const { controller, createTransaction } = harness(undefined, {
      categories: [expenseCategory],
    });
    const accountId = idOf(controller.createAccount(minimalDraft("Bank A · PLN", PLN)));
    const result = controller.createTransaction({
      ...expenseDraft(accountId),
      type: "income",
      categoryId: expenseCategory.id,
    });
    expect("fieldErrors" in result && result.fieldErrors).toEqual([
      {
        path: "categoryId",
        message: expect.stringContaining("income"),
        messageKey: "transactions.categoryKindMismatch",
        params: { type: "income" },
      },
    ]);
    expect(createTransaction).not.toHaveBeenCalled();
  });

  /**
   * H1a — the case that reached a saved row: D2's payee memory proposed a
   * leaf a payee last sat on, the category had since been archived, and
   * `snapshot.categories` (which excludes archived rows) had no match — so
   * the kind check above simply found nothing to compare and let it through.
   * Absent is now refused the same as wrong-kind, since neither is a category
   * any picker would offer.
   */
  it("refuses a categoryId that is not among the categories offered (H1a — archived, or gone)", () => {
    const { controller, createTransaction } = harness(undefined, { categories: [] });
    const accountId = idOf(controller.createAccount(minimalDraft("Bank A · PLN", PLN)));
    const result = controller.createTransaction({
      ...expenseDraft(accountId),
      categoryId: id<"categories">("77777777-7777-4777-8777-777777777777"),
    });
    expect("fieldErrors" in result && result.fieldErrors).toEqual([
      {
        path: "categoryId",
        message: expect.stringContaining("no longer available"),
        messageKey: "transactions.categoryUnavailable",
      },
    ]);
    expect(createTransaction).not.toHaveBeenCalled();
  });

  it("admits a categoryId whose kind matches the transaction's type", () => {
    const expenseCategory: PhoneCategory = {
      id: id<"categories">("66666666-6666-4666-8666-666666666666"),
      name: "Eating out",
      kind: "expense",
    };
    const { controller, createTransaction } = harness(undefined, {
      categories: [expenseCategory],
    });
    const accountId = idOf(controller.createAccount(minimalDraft("Bank A · PLN", PLN)));
    const result = controller.createTransaction({
      ...expenseDraft(accountId),
      categoryId: expenseCategory.id,
    });
    expect("id" in result).toBe(true);
    expect(createTransaction).toHaveBeenCalledOnce();
  });

  /**
   * M — the H2 guarantee above checked `amountOriginal` only; a transfer's
   * destination leg (§7.5) can carry the same defect in its own currency,
   * matching `assert_amount_scale`'s own extension
   * (`0011_transaction_scale_and_category_kind.sql`).
   */
  it("refuses toAmount past the destination account's own scale (M)", () => {
    const { controller, createTransaction } = harness();
    const fromId = idOf(controller.createAccount(minimalDraft("Bank A · PLN", PLN)));
    const toId = idOf(controller.createAccount(minimalDraft("Bank B · BYN", BYN)));

    const result = controller.createTransaction({
      type: "transfer",
      amount: "10",
      accountId: fromId,
      categoryId: null,
      date: "2026-08-23",
      note: "",
      isBusiness: false,
      counterpartyId: null,
      counterpartyRole: null,
      toAccountId: toId,
      toAmount: "10.125",
      toCurrency: BYN,
    });

    expect("fieldErrors" in result && result.fieldErrors).toEqual([
      {
        path: "toAmount",
        message: expect.stringContaining("decimal places"),
        messageKey: "transactions.tooManyDecimals",
        params: { currency: BYN, decimals: "2" },
      },
    ]);
    expect(createTransaction).not.toHaveBeenCalled();
  });

  it("admits toAmount at exactly the destination account's own scale", () => {
    const { controller, createTransaction } = harness();
    const fromId = idOf(controller.createAccount(minimalDraft("Bank A · PLN", PLN)));
    const toId = idOf(controller.createAccount(minimalDraft("Bank B · BYN", BYN)));

    const result = controller.createTransaction({
      type: "transfer",
      amount: "10",
      accountId: fromId,
      categoryId: null,
      date: "2026-08-23",
      note: "",
      isBusiness: false,
      counterpartyId: null,
      counterpartyRole: null,
      toAccountId: toId,
      toAmount: "10.12",
      toCurrency: BYN,
    });

    expect("id" in result).toBe(true);
    expect(createTransaction).toHaveBeenCalledOnce();
  });

  /**
   * M — `fee` (S31 §9.1) carries no currency column of its own; it is
   * always the row's own `currency`, so it is checked against the *source*
   * account's own scale, matching the extended `assert_amount_scale`
   * trigger (`0011_transaction_scale_and_category_kind.sql`).
   */
  it("refuses fee past the account's own scale (M)", () => {
    const { controller, createTransaction } = harness();
    const accountId = idOf(controller.createAccount(minimalDraft("Bank A · PLN", PLN)));

    const result = controller.createTransaction({ ...expenseDraft(accountId), fee: "0.125" });

    expect("fieldErrors" in result && result.fieldErrors).toEqual([
      {
        path: "fee",
        message: expect.stringContaining("decimal places"),
        messageKey: "transactions.tooManyDecimals",
        params: { currency: PLN, decimals: "2" },
      },
    ]);
    expect(createTransaction).not.toHaveBeenCalled();
  });

  it("admits fee at exactly the account's own scale", () => {
    const { controller, createTransaction } = harness();
    const accountId = idOf(controller.createAccount(minimalDraft("Bank A · PLN", PLN)));

    const result = controller.createTransaction({ ...expenseDraft(accountId), fee: "0.12" });

    expect("id" in result).toBe(true);
    expect(createTransaction).toHaveBeenCalledOnce();
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
    const port = basePort({
      listAccounts: () => [
        account("11111111-1111-4111-8111-111111111111", "Bank A · PLN", PLN, "0"),
      ],
      listCurrencies: () => [
        {
          code: PLN,
          name: "Polish Złoty",
          symbol: "zł",
          decimals: 2,
          capturable: false,
          isPivot: false,
        },
      ],
      createTransaction: vi.fn(),
    });
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

  /**
   * L — a refusal is not a success: `phase` used to read "success" on every
   * one of `createTransaction`'s own early returns, including the two H2/
   * H1-b checks this file's `it`s above pin — reporting a validation bounce
   * the same way a completed write would.
   */
  it("reports a refusal's own phase as failure, not success", () => {
    const diagnostics: object[] = [];
    const { controller } = harness((event) => diagnostics.push(event));
    const accountId = idOf(controller.createAccount(minimalDraft("Bank A · PLN", PLN)));

    controller.createTransaction(expenseDraft(accountId, "10.125"));

    const createTransactionEvents = diagnostics.filter(
      (event) => "action" in event && event.action === "create_transaction",
    );
    expect(createTransactionEvents).toContainEqual(expect.objectContaining({ phase: "failure" }));
    expect(createTransactionEvents).not.toContainEqual(
      expect.objectContaining({ phase: "success" }),
    );
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

    /**
     * M1 — `accounts.opening_balance` had no client mirror at all: an
     * account's own opening figure past its own currency's scale used to
     * reach the write unrefused (`accounts_balance_scale_matches_currency`,
     * `0011_transaction_scale_and_category_kind.sql`, is the guarantee this
     * mirrors).
     */
    it("refuses an opening balance past the account's own currency scale", () => {
      const { controller, updateAccount } = harness();
      const accountId = idOf(controller.createAccount(minimalDraft("Bank A · PLN", PLN)));

      const result = controller.updateAccount({
        id: accountId,
        version: 1,
        patch: { openingBalance: "48.905" },
      });

      expect("fieldErrors" in result && result.fieldErrors).toEqual([
        {
          path: "openingBalance",
          message: expect.stringContaining("decimal places"),
          messageKey: "transactions.tooManyDecimals",
          params: { currency: "PLN", decimals: "2" },
        },
      ]);
      expect(updateAccount).not.toHaveBeenCalled();
    });

    it("admits an opening balance at exactly the account's own currency scale", () => {
      const { controller, updateAccount } = harness();
      const accountId = idOf(controller.createAccount(minimalDraft("Bank A · PLN", PLN)));

      const result = controller.updateAccount({
        id: accountId,
        version: 1,
        patch: { openingBalance: "48.90" },
      });

      expect("id" in result).toBe(true);
      expect(updateAccount).toHaveBeenCalledOnce();
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

    /**
     * M1 — `observedBalance` is what this write puts onto
     * `accounts.expected_balance`; the same
     * `accounts_balance_scale_matches_currency` trigger that column shares
     * with `opening_balance` had no client mirror here either.
     */
    it("refuses an observed balance past the account's own currency scale", () => {
      const { controller, reconcileAccount } = harness();
      const accountId = idOf(controller.createAccount(minimalDraft("Bank A · PLN", PLN)));

      const result = controller.reconcileAccount({
        accountId,
        observedBalance: "42.205",
        asOf: "2026-08-23",
        note: "",
        categoryId: null,
      });

      expect("fieldErrors" in result && result.fieldErrors).toEqual([
        {
          path: "observedBalance",
          message: expect.stringContaining("decimal places"),
          messageKey: "transactions.tooManyDecimals",
          params: { currency: "PLN", decimals: "2" },
        },
      ]);
      expect(reconcileAccount).not.toHaveBeenCalled();
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
    // C1 — mapped to its own `messageKey`, not the bare `refusalFromThrow` fallback.
    expect("fieldErrors" in refused && refused.fieldErrors).toEqual([
      {
        path: "",
        message: expect.stringContaining("cannot re-rate"),
        messageKey: "fx.pivotChangeRefused",
      },
    ]);
    expect(listener).not.toHaveBeenCalled();

    const result = controller.changePivot({ code: "USD" });
    expect(result).toEqual({ code: currencyCode("USD"), droppedDates: 0 });
    expect(listener).toHaveBeenCalledTimes(1);
  });

  // M2 — §7.0's *"dropped rather than left mis-quoted"* has to reach a
  // screen, and nothing but the port's own return value carries it: a
  // rewrite that kept one date in twenty-eight is otherwise byte-identical,
  // from up here, to one that kept them all.
  it("changePivot: the executor's droppedDates count reaches the caller", () => {
    const { controller, port } = harness();
    (port.changePivot as ReturnType<typeof vi.fn>).mockImplementationOnce(() => ({
      droppedDates: 27,
    }));

    const result = controller.changePivot({ code: "USD" });
    expect(result).toEqual({ code: currencyCode("USD"), droppedDates: 27 });
  });

  // C1 — the executor's other refusal gets its own text too, never the
  // same fallback as the transaction-count gate.
  it("changePivot: 'already the pivot' maps to its own messageKey", () => {
    const { controller, port } = harness();
    (port.changePivot as ReturnType<typeof vi.fn>).mockImplementationOnce(() => {
      throw new Error("change_pivot: USD is already the pivot");
    });
    const refused = controller.changePivot({ code: "USD" });
    expect("fieldErrors" in refused && refused.fieldErrors).toEqual([
      {
        path: "",
        message: expect.stringContaining("already the pivot"),
        messageKey: "fx.pivotAlreadyPivot",
      },
    ]);
  });

  it("setManualRate: a throwing port maps to fieldErrors, a success calls refresh and returns written/replacedManual", () => {
    const { controller, port } = harness();
    const listener = vi.fn();
    controller.subscribe(listener);
    const range = {
      base: "USD",
      quote: "PLN",
      from: "2026-01-01",
      to: "2026-01-03",
      today: "2026-06-01",
    };

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
    const port = basePort({
      listCurrencies: () => CURRENCIES,
      listCategoryTree: () => tree,
      createCategory,
    });
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
  function detailHarness(overrides: Partial<PhoneLedgerPort> = {}) {
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
      brandKey: null,
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

    const port = basePort({
      listCurrencies: () => CURRENCIES,
      getTransaction,
      updateTransaction,
      deleteTransaction,
      setTransactionLines,
      ...overrides,
    });
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

  /**
   * `audit_log` is not a replicated table (`architecture/14-local-first.md`),
   * so `basePort`'s own default — every real `LocalLedgerSession` agrees —
   * is `unavailable_on_device`. H3: a status, never a bare `[]` standing in
   * for "no data".
   */
  it("getAuditLog answers unavailable_on_device by default", () => {
    const { controller } = detailHarness();
    expect(controller.getAuditLog("transactions", TXN)).toEqual({
      status: "unavailable_on_device",
    });
  });

  it("getAuditLog reads through the port when one is supplied", () => {
    const entry = {
      id: "1",
      entity: "transactions" as const,
      entityId: TXN,
      action: "created",
      actor: "user" as const,
      before: null,
      after: null,
      at: "2026-08-06T10:00:00Z",
    };
    const getAuditLog = vi.fn<PhoneLedgerPort["getAuditLog"]>(() => ({
      status: "ok",
      rows: [entry],
    }));
    const { controller } = detailHarness({ getAuditLog });
    expect(controller.getAuditLog("transactions", TXN)).toEqual({ status: "ok", rows: [entry] });
    expect(getAuditLog).toHaveBeenCalledWith("transactions", TXN);
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

  /**
   * H3 — `transaction_lines.amount` carries no currency of its own; a split
   * past the *parent* transaction's own scale (PLN, two decimal places
   * here) used to reach the write unrefused — the client had no mirror of
   * `transaction_lines_amount_scale_matches_currency`
   * (`0011_transaction_scale_and_category_kind.sql`) at all.
   */
  it("refuses a split line past its parent transaction's own currency scale", () => {
    const { controller, setTransactionLines } = detailHarness();

    const result = controller.setTransactionLines(TXN, 1, [
      {
        id: "11111111-1111-4111-8111-111111111111",
        description: "Groceries",
        amount: "4.905",
      },
      {
        id: "22222222-2222-4222-8222-222222222222",
        description: "Fuel",
        amount: "43.995",
      },
    ]);

    expect("fieldErrors" in result && result.fieldErrors).toEqual([
      {
        path: "lines.0.amount",
        message: expect.stringContaining("decimal places"),
        messageKey: "transactions.tooManyDecimals",
        params: { currency: "PLN", decimals: "2" },
      },
      {
        path: "lines.1.amount",
        message: expect.stringContaining("decimal places"),
        messageKey: "transactions.tooManyDecimals",
        params: { currency: "PLN", decimals: "2" },
      },
    ]);
    expect(setTransactionLines).not.toHaveBeenCalled();
  });
});

describe("phone ledger controller — counterparties and settlement", () => {
  const NINA = id<"counterparties">("11111111-1111-4111-8111-111111111111");
  const MAREK = id<"counterparties">("22222222-2222-4222-8222-222222222222");

  function counterpartyHarness(
    overrides: Partial<PhoneLedgerPort> = {},
    diagnostics?: (event: object) => void,
  ) {
    let counterparties: PhoneCounterparty[] = [
      {
        id: NINA,
        name: "Nina",
        kind: "person",
        settlementCurrency: null,
        contact: null,
        note: "",
        archived: false,
        version: 1,
      },
      {
        id: MAREK,
        name: "Marek",
        kind: "person",
        settlementCurrency: null,
        contact: null,
        note: "",
        archived: false,
        version: 1,
      },
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
          contact: input.contact,
          note: input.note,
          archived: false,
          version: 1,
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
              contact: input.patch.contact === undefined ? c.contact : input.patch.contact,
              note: input.patch.note ?? c.note,
              archived: input.patch.archived ?? c.archived,
              version,
            }
          : c,
      );
    });
    // The merge fixture's own live state — enough for `listCounterpartyMerges`
    // to answer, and for `unmergeCounterparties` to make one disappear again.
    let merges: {
      mergeId: string;
      winnerId: string;
      loserName: string;
      movedCount: number;
      unmerged: boolean;
    }[] = [];
    const mergeCounterparties = vi.fn<PhoneLedgerPort["mergeCounterparties"]>((input) => {
      const loser = counterparties.find((c) => c.id === input.loserId);
      merges = [
        ...merges,
        {
          mergeId: input.mergeId,
          winnerId: input.winnerId,
          loserName: loser?.name ?? "",
          movedCount: 0,
          unmerged: false,
        },
      ];
    });
    const unmergeCounterparties = vi.fn<PhoneLedgerPort["unmergeCounterparties"]>((input) => {
      merges = merges.map((m) => (m.mergeId === input.mergeId ? { ...m, unmerged: true } : m));
    });
    const listCounterpartyMerges = vi.fn<PhoneLedgerPort["listCounterpartyMerges"]>(
      (counterpartyId) =>
        merges
          .filter((m) => m.winnerId === counterpartyId && !m.unmerged)
          .map((m) => ({
            mergeId: id<"counterpartyMerges">(m.mergeId),
            loserName: m.loserName,
            mergedAt: new Date("2026-08-23T10:00:00Z"),
            movedCount: m.movedCount,
          })),
    );
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

    const port = basePort({
      listCounterparties,
      createCounterparty,
      updateCounterparty,
      mergeCounterparties,
      unmergeCounterparties,
      recordDistinctCounterparties,
      settleDebt,
      listCounterpartyMerges,
      ...overrides,
    });

    const controller = createPhoneLedger(port, {
      capture: () => ({
        date: accountingDate("2026-08-23"),
        timeZone: "Europe/Warsaw",
        offsetMinutes: 120,
        at: new Date("2026-08-23T10:00:00Z"),
      }),
      ...(diagnostics ? { diagnostics } : {}),
      id: <Table extends IdTable>() => id<Table>("00000000-0000-4000-8000-000000000099"),
    });

    return {
      controller,
      createCounterparty,
      updateCounterparty,
      mergeCounterparties,
      unmergeCounterparties,
      listCounterpartyMerges,
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

  it("carries recorded-distinct pairs in the snapshot, read on refresh (finding 5)", () => {
    const pairs: readonly (readonly [Id<"counterparties">, Id<"counterparties">])[] = [
      [NINA, MAREK],
    ];
    const listDistinctCounterpartyPairs = vi.fn(() => pairs);
    const { controller } = counterpartyHarness({ listDistinctCounterpartyPairs });

    expect(controller.getSnapshot().distinctCounterpartyPairs).toEqual([[NINA, MAREK]]);
    expect(listDistinctCounterpartyPairs).toHaveBeenCalled();
  });

  it("S13's overflow — lists a live merge, and unmerging it removes it again (finding 4)", () => {
    const { controller, listCounterpartyMerges } = counterpartyHarness();

    expect(controller.listCounterpartyMerges(NINA)).toEqual([]);

    const merged = controller.mergeCounterparties({ winnerId: NINA, loserId: MAREK });
    if (!("id" in merged)) throw new Error("expected a merge id");

    const live = controller.listCounterpartyMerges(NINA);
    expect(live).toEqual([
      {
        mergeId: merged.id,
        loserName: "Marek",
        mergedAt: expect.any(Date),
        movedCount: 0,
      },
    ]);
    expect(listCounterpartyMerges).toHaveBeenCalledWith(NINA);

    controller.unmergeCounterparties({ mergeId: merged.id });
    expect(controller.listCounterpartyMerges(NINA)).toEqual([]);
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

  /**
   * C1 — mirrors `createTransaction`'s own uncapturable-account guard
   * (§14.6): refuse before the outbox write, not after `settle_debt`'s
   * executor has already committed the entry.
   */
  it("settleDebt: refuses an uncapturable account before the write", () => {
    const { controller, settleDebt } = counterpartyHarness({
      listAccounts: () => [
        account("33333333-3333-4333-8333-333333333333", "Bank A · PLN", PLN, "0"),
      ],
      listCurrencies: () => [
        {
          code: PLN,
          name: "Polish Złoty",
          symbol: "zł",
          decimals: 2,
          capturable: false,
          isPivot: false,
        },
      ],
    });

    const result = controller.settleDebt({
      counterpartyId: NINA,
      accountId: "33333333-3333-4333-8333-333333333333",
      date: "2026-08-04",
      amount: "50",
      currency: "PLN",
      dischargesCurrency: "PLN",
      dischargesAmount: "50",
      note: "",
      categoryId: null,
    });

    expect("fieldErrors" in result && result.fieldErrors).toEqual([
      {
        path: "accountId",
        message: "PLN needs an exchange rate before a transaction can be recorded in it",
        messageKey: "transactions.needsRate",
        params: { currency: "PLN" },
      },
    ]);
    expect(settleDebt).not.toHaveBeenCalled();
  });

  /**
   * M — the H2 guarantee (`createTransaction`) checked `amountOriginal`
   * only; `discharges.amount` values `debt_amount` (S14's coalesce) and can
   * carry the same defect, past `discharges.currency`'s own scale.
   */
  it("settleDebt: refuses discharges.amount past its own currency's scale", () => {
    const { controller, settleDebt } = counterpartyHarness({
      listAccounts: () => [
        account("33333333-3333-4333-8333-333333333333", "Bank A · PLN", PLN, "0"),
      ],
      listCurrencies: () => [
        {
          code: PLN,
          name: "Polish Złoty",
          symbol: "zł",
          decimals: 2,
          capturable: true,
          isPivot: true,
        },
      ],
    });

    const result = controller.settleDebt({
      counterpartyId: NINA,
      accountId: "33333333-3333-4333-8333-333333333333",
      date: "2026-08-04",
      amount: "50",
      currency: "PLN",
      dischargesCurrency: "PLN",
      dischargesAmount: "50.125",
      note: "",
      categoryId: null,
    });

    expect("fieldErrors" in result && result.fieldErrors).toEqual([
      {
        path: "discharges.amount",
        message: expect.stringContaining("decimal places"),
        messageKey: "transactions.tooManyDecimals",
        params: { currency: "PLN", decimals: "2" },
      },
    ]);
    expect(settleDebt).not.toHaveBeenCalled();
  });

  /**
   * M — `settle_debt`'s own `amount` (the "Into"/"From" leg, in the
   * account's own currency) had no client mirror at all — only
   * `discharges.amount` did (the test above). Same guarantee, mirrored the
   * same way `createTransaction`'s own `amountOriginal` guard is.
   */
  it("settleDebt: refuses amount past the account currency's own scale", () => {
    const { controller, settleDebt } = counterpartyHarness({
      listAccounts: () => [
        account("33333333-3333-4333-8333-333333333333", "Bank A · PLN", PLN, "0"),
      ],
      listCurrencies: () => [
        {
          code: PLN,
          name: "Polish Złoty",
          symbol: "zł",
          decimals: 2,
          capturable: true,
          isPivot: true,
        },
      ],
    });

    const result = controller.settleDebt({
      counterpartyId: NINA,
      accountId: "33333333-3333-4333-8333-333333333333",
      date: "2026-08-04",
      amount: "50.125",
      currency: "PLN",
      dischargesCurrency: "EUR",
      dischargesAmount: "50",
      note: "",
      categoryId: null,
    });

    expect("fieldErrors" in result && result.fieldErrors).toEqual([
      {
        path: "amount",
        message: expect.stringContaining("decimal places"),
        messageKey: "transactions.tooManyDecimals",
        params: { currency: "PLN", decimals: "2" },
      },
    ]);
    expect(settleDebt).not.toHaveBeenCalled();
  });

  /**
   * M4 — `money.toMoney` calls `Decimal`'s own constructor, which throws
   * `DecimalError` on a malformed string rather than returning one. This
   * controller used to call it directly on `draft.amount`, so a malformed
   * figure threw out of `settleDebt` instead of refusing.
   */
  it("settleDebt: a malformed amount refuses through fieldErrors, never throws", () => {
    const { controller, settleDebt } = counterpartyHarness({
      listAccounts: () => [
        account("33333333-3333-4333-8333-333333333333", "Bank A · PLN", PLN, "0"),
      ],
      listCurrencies: () => [
        {
          code: PLN,
          name: "Polish Złoty",
          symbol: "zł",
          decimals: 2,
          capturable: true,
          isPivot: true,
        },
      ],
    });

    expect(() =>
      controller.settleDebt({
        counterpartyId: NINA,
        accountId: "33333333-3333-4333-8333-333333333333",
        date: "2026-08-04",
        amount: "abc",
        currency: "PLN",
        dischargesCurrency: "PLN",
        dischargesAmount: "50",
        note: "",
        categoryId: null,
      }),
    ).not.toThrow();

    const result = controller.settleDebt({
      counterpartyId: NINA,
      accountId: "33333333-3333-4333-8333-333333333333",
      date: "2026-08-04",
      amount: "abc",
      currency: "PLN",
      dischargesCurrency: "PLN",
      dischargesAmount: "50",
      note: "",
      categoryId: null,
    });
    expect("fieldErrors" in result && result.fieldErrors.some((e) => e.path === "amount")).toBe(
      true,
    );
    expect(settleDebt).not.toHaveBeenCalled();
  });

  /** M4 — same guard, the "Discharges" leg (`draft.dischargesAmount`). */
  it("settleDebt: a malformed discharges.amount refuses through fieldErrors, never throws", () => {
    const { controller, settleDebt } = counterpartyHarness({
      listAccounts: () => [
        account("33333333-3333-4333-8333-333333333333", "Bank A · PLN", PLN, "0"),
      ],
      listCurrencies: () => [
        {
          code: PLN,
          name: "Polish Złoty",
          symbol: "zł",
          decimals: 2,
          capturable: true,
          isPivot: true,
        },
      ],
    });

    const result = controller.settleDebt({
      counterpartyId: NINA,
      accountId: "33333333-3333-4333-8333-333333333333",
      date: "2026-08-04",
      amount: "50",
      currency: "PLN",
      dischargesCurrency: "PLN",
      dischargesAmount: "abc",
      note: "",
      categoryId: null,
    });
    expect(
      "fieldErrors" in result && result.fieldErrors.some((e) => e.path === "discharges.amount"),
    ).toBe(true);
    expect(settleDebt).not.toHaveBeenCalled();
  });

  /**
   * L — every early return here used to report `phase: "success"`, the same
   * defect `createTransaction`'s own diagnostics test pins above: a refusal
   * is not a success.
   */
  it("settleDebt: reports a refusal's own phase as failure, not success", () => {
    const diagnostics: object[] = [];
    const { controller } = counterpartyHarness(
      {
        listAccounts: () => [
          account("33333333-3333-4333-8333-333333333333", "Bank A · PLN", PLN, "0"),
        ],
        listCurrencies: () => [
          {
            code: PLN,
            name: "Polish Złoty",
            symbol: "zł",
            decimals: 2,
            capturable: true,
            isPivot: true,
          },
        ],
      },
      (event) => diagnostics.push(event),
    );

    controller.settleDebt({
      counterpartyId: NINA,
      accountId: "33333333-3333-4333-8333-333333333333",
      date: "2026-08-04",
      amount: "50.125",
      currency: "PLN",
      dischargesCurrency: "EUR",
      dischargesAmount: "50",
      note: "",
      categoryId: null,
    });

    const settleDebtEvents = diagnostics.filter(
      (event) => "action" in event && event.action === "settle_debt",
    );
    expect(settleDebtEvents).toContainEqual(expect.objectContaining({ phase: "failure" }));
    expect(settleDebtEvents).not.toContainEqual(expect.objectContaining({ phase: "success" }));
  });

  it("settleDebt: admits discharges.amount at exactly its own currency's scale", () => {
    const { controller, settleDebt } = counterpartyHarness({
      listAccounts: () => [
        account("33333333-3333-4333-8333-333333333333", "Bank A · PLN", PLN, "0"),
      ],
      listCurrencies: () => [
        {
          code: PLN,
          name: "Polish Złoty",
          symbol: "zł",
          decimals: 2,
          capturable: true,
          isPivot: true,
        },
      ],
    });

    const result = controller.settleDebt({
      counterpartyId: NINA,
      accountId: "33333333-3333-4333-8333-333333333333",
      date: "2026-08-04",
      amount: "50",
      currency: "PLN",
      dischargesCurrency: "PLN",
      dischargesAmount: "50.12",
      note: "",
      categoryId: null,
    });

    expect("id" in result).toBe(true);
    expect(settleDebt).toHaveBeenCalledOnce();
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

  /**
   * #116 review, M3 — a mismatched `currency` is refused on the field, never
   * silently rewritten to the account's own (SPEC.md §6.5). This replaces
   * the prior "overwrites the draft's currency" test: the overwrite it
   * proved is the bug.
   */
  it("settleDebt: refuses a currency that does not match the account's own, before the write", () => {
    const { controller, settleDebt } = counterpartyHarness({
      listAccounts: () => [
        account("33333333-3333-4333-8333-333333333333", "Bank A · PLN", PLN, "0"),
      ],
      listCurrencies: () => [
        {
          code: PLN,
          name: "Polish Złoty",
          symbol: "zł",
          decimals: 2,
          capturable: true,
          isPivot: false,
        },
      ],
    });

    const result = controller.settleDebt({
      counterpartyId: NINA,
      accountId: "33333333-3333-4333-8333-333333333333",
      date: "2026-08-04",
      amount: "50",
      currency: "EUR", // mismatched — the account is PLN
      dischargesCurrency: "EUR",
      dischargesAmount: "50",
      note: "",
      categoryId: null,
    });

    expect(result).toEqual({
      fieldErrors: [
        {
          path: "currency",
          message: "This account only holds PLN — settle in that currency.",
          messageKey: "settleDebt.currencyMismatch",
          params: { accountCurrency: "PLN" },
        },
      ],
    });
    expect(settleDebt).not.toHaveBeenCalled();
  });

  /**
   * R2 H4 — `type` is read from the balance this controller can see right
   * now and carried on the payload, not left for the executor to derive.
   */
  it("settleDebt: carries type, read from the live balance's sign", () => {
    const { controller, settleDebt } = counterpartyHarness({
      listCounterpartyBalances: () => [
        {
          counterpartyId: NINA,
          name: "Nina",
          kind: "person",
          settlementCurrency: null,
          currency: "EUR" as CurrencyCode,
          decimals: 2,
          balance: money.toMoney("-70"),
          ageDays: null,
          bucket: null,
        },
      ],
    });

    controller.settleDebt({
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

    expect(settleDebt).toHaveBeenCalledWith(
      expect.objectContaining({ type: "expense" }),
      expect.anything(),
    );
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

    // C1 — never the executor's raw English: `settleDebtRefusal` never falls
    // through to `refusalFromThrow`, so an unrecognised message still carries
    // the shared `common.couldNotSave` key for the screen to resolve.
    expect("fieldErrors" in result && result.fieldErrors).toEqual([
      {
        path: "",
        message: "settle_debt: the row changed between insert and the debt-fields update",
        messageKey: "common.couldNotSave",
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
    const port = basePort({ listCounterpartyBalances });
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
        {
          path: "parentId",
          message: "Food belongs to the expense side — a category cannot move across kinds",
          messageKey: "categories.moveAcrossKindsExpense",
          params: { name: "Food" },
        },
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
