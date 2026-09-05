/**
 * @vitest-environment jsdom
 *
 * S01 · Dashboard — rendered under `react-native-web`, the same shape
 * `screens.test.tsx` uses for the phone screens: a fake `PhoneLedgerPort`
 * behind `<LedgerProvider>`, the router mocked.
 *
 * **The one property this file exists to prove**: the grid renders whatever
 * `dashboard_layouts` hands it, never a hardcoded five — a layout naming one
 * widget kind must render exactly that one.
 */

import { render, screen } from "@testing-library/react";
import {
  createPhoneLedger,
  type PhoneAccount,
  type PhoneDashboardLayout,
  type PhoneLedgerPort,
  type PhoneRecentTransaction,
} from "@waltning/client/ledger/create-phone-ledger";
import { LedgerProvider } from "@waltning/client/ledger/ledger-provider";
import { accountingDate } from "@waltning/core/date";
import { id } from "@waltning/core/id";
import { currencyCode, toMoney } from "@waltning/core/money";
import { beforeEach, describe, expect, it, vi } from "vitest";

const router = { push: vi.fn(), back: vi.fn(), dismissTo: vi.fn() };
vi.mock("expo-router", () => ({
  get router() {
    return router;
  },
  useLocalSearchParams: () => ({}),
}));

import Dashboard from "./dashboard-screen";

const PLN = currencyCode("PLN");

const ACCOUNT: PhoneAccount = {
  id: id<"accounts">("11111111-1111-4111-8111-111111111111"),
  name: "Bank A · PLN",
  kind: "bank",
  currency: PLN,
  decimals: 2,
  balance: toMoney("12480.20"),
  groupId: null,
  ownership: "own",
  isBusiness: false,
  archived: false,
  expectedBalance: null,
  openingBalance: toMoney("0"),
  openingDate: null,
  memo: "",
  version: 1,
};

const RECENT: PhoneRecentTransaction = {
  id: id<"transactions">("22222222-2222-4222-8222-222222222222"),
  date: accountingDate("2026-08-12"),
  payee: "Grocer",
  categoryName: "Groceries",
  accountName: "Bank A · PLN",
  amount: toMoney("-120.00"),
  currency: PLN,
  decimals: 2,
  isBusiness: false,
};

const STANDING_LAYOUT: PhoneDashboardLayout = {
  id: "layout-1",
  name: "Standing",
  widgets: [
    { id: "w1", kind: "balances", slot: "a1", size: "m", config: {}, sort: 0 },
    { id: "w2", kind: "recent", slot: "a2", size: "m", config: {}, sort: 1 },
    { id: "w3", kind: "debt", slot: "a3", size: "s", config: {}, sort: 2 },
    { id: "w4", kind: "spend_by_category", slot: "b1", size: "m", config: {}, sort: 3 },
    { id: "w5", kind: "income_vs_expense", slot: "b2", size: "l", config: {}, sort: 4 },
  ],
};

function fakeController(options: {
  accounts?: readonly PhoneAccount[];
  layout?: PhoneDashboardLayout | null;
  spendByCategory?: PhoneLedgerPort["readSpendByCategory"];
  incomeVsExpense?: PhoneLedgerPort["readIncomeVsExpense"];
  recent?: readonly PhoneRecentTransaction[];
}) {
  const accounts = options.accounts ?? [ACCOUNT];
  const port: PhoneLedgerPort = {
    listAccounts: () => accounts,
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
    listGroups: () => [],
    listRecent: () => options.recent ?? [RECENT],
    listCategories: () => [],
    listCategoryTree: () => [
      {
        id: id("cat-groceries"),
        parentId: null,
        name: "Groceries",
        kind: "expense",
        isLeaf: true,
        sort: 0,
      },
    ],
    listCounterparties: () => [],
    listPayeeHistory: () => [],
    listNetWorth: () => [
      {
        currency: PLN,
        decimals: 2,
        mine: toMoney("12480.20"),
        ours: toMoney("12480.20"),
        hasShared: false,
      },
    ],
    readPeriodSpend: () => [],
    readSpendByCategory:
      options.spendByCategory ??
      (() => [
        { currency: PLN, decimals: 2, categoryId: "cat-groceries", amount: toMoney("620.00") },
      ]),
    readIncomeVsExpense:
      options.incomeVsExpense ??
      (() => [
        {
          label: "2026-08",
          currency: PLN,
          decimals: 2,
          income: toMoney("6500.00"),
          expense: toMoney("3900.00"),
        },
      ]),
    readActiveDashboardLayout: () =>
      options.layout === undefined ? STANDING_LAYOUT : options.layout,
    listUnsettledClearing: () => [],
    listCounterpartyBalances: () => [
      {
        counterpartyId: id("counterparty-1"),
        name: "A friend",
        kind: "person",
        settlementCurrency: PLN,
        currency: PLN,
        decimals: 2,
        balance: toMoney("840.00"),
        ageDays: null,
        bucket: null,
      },
    ],
    listCounterpartyMerges: () => [],
    listDistinctCounterpartyPairs: () => [],
    balanceAsOf: () => toMoney("0"),
    searchTransactions: () => ({
      rows: [],
      nextCursor: undefined,
      total: { count: 0, currencies: [] },
    }),
    createAccount: () => undefined,
    createTransaction: () => undefined,
    createCategory: () => undefined,
    categorizeBatch: () => undefined,
    getTransaction: () => null,
    updateTransaction: () => undefined,
    deleteTransaction: () => undefined,
    setTransactionLines: () => undefined,
    updateAccount: () => undefined,
    archiveAccount: () => undefined,
    reconcileAccount: () => undefined,
    createGroup: () => undefined,
    readRate: () => null,
    readCrossRate: () => null,
    listCurrencySettings: () => [],
    readCoverage: () => [],
    listFxRates: () => [],
    addCurrency: () => undefined,
    archiveCurrency: () => undefined,
    setRateSource: () => undefined,
    setPinned: () => undefined,
    updateCurrency: () => undefined,
    changePivot: () => ({ droppedDates: 0 }),
    setManualRate: () => ({ written: 0, replacedManual: 0 }),
    clearManualRate: () => ({ deleted: 0 }),
    createCounterparty: () => undefined,
    updateCounterparty: () => undefined,
    mergeCounterparties: () => undefined,
    unmergeCounterparties: () => undefined,
    recordDistinctCounterparties: () => undefined,
    settleDebt: () => ({ residual: toMoney("0"), overSettled: false }),
    listFullCategoryTree: () => [],
    listCategoryUsage: () => new Map(),
    readCategoryReferenceCounts: () => ({ transactions: 0, lines: 0, rules: 0 }),
    renameCategory: () => undefined,
    reparentCategory: () => undefined,
    convertLeafGroup: () => undefined,
    mergeCategories: () => undefined,
    archiveCategory: () => undefined,
    reset: () => undefined,
  };
  return createPhoneLedger(port, {
    capture: () => ({
      date: accountingDate("2026-09-04"),
      timeZone: "Europe/Warsaw",
      offsetMinutes: 120,
      at: new Date("2026-09-04T10:00:00Z"),
    }),
    id: () => id("33333333-3333-4333-8333-333333333333"),
  });
}

function withLedger(controller: ReturnType<typeof fakeController>) {
  return render(
    <LedgerProvider controller={controller}>
      <Dashboard />
    </LedgerProvider>,
  );
}

beforeEach(() => {
  router.push.mockClear();
});

describe("Dashboard (S01)", () => {
  it("renders every widget the seeded layout names", () => {
    withLedger(fakeController({}));

    expect(screen.getByText("Balances")).toBeTruthy();
    expect(screen.getByText("Bank A · PLN")).toBeTruthy();
    expect(screen.getByText("Grocer")).toBeTruthy();
    expect(screen.getAllByText("Groceries").length).toBeGreaterThan(0);
    expect(screen.getByText("Debt")).toBeTruthy();
    expect(screen.getByText("Spend by category")).toBeTruthy();
    expect(screen.getByText("Income vs expense")).toBeTruthy();
  });

  it("renders only the widgets the layout names — never a hardcoded five", () => {
    withLedger(
      fakeController({
        layout: {
          id: "layout-1",
          name: "Standing",
          widgets: [{ id: "w1", kind: "balances", slot: "a1", size: "m", config: {}, sort: 0 }],
        },
      }),
    );

    expect(screen.getByText("Balances")).toBeTruthy();
    expect(screen.queryByText("Debt")).toBeNull();
    expect(screen.queryByText("Spend by category")).toBeNull();
    expect(screen.queryByText("Income vs expense")).toBeNull();
  });

  it("renders no widgets while the layout has not resolved (an empty, never-migrated database)", () => {
    withLedger(fakeController({ layout: null }));

    expect(screen.queryByText("Balances")).toBeNull();
    expect(screen.queryByText("Debt")).toBeNull();
  });

  it("shows the first-run empty state with no accounts, replacing the whole grid (S01 §6)", () => {
    withLedger(fakeController({ accounts: [] }));

    expect(screen.queryByText("Balances")).toBeNull();
    expect(screen.queryByText("Spend by category")).toBeNull();
  });

  /** The split-lines trap, end to end: the reader's own sum reaches the widget's rendered figure unchanged. */
  it("renders the spend-by-category fold's own total, not a recomputed one", () => {
    withLedger(
      fakeController({
        spendByCategory: () => [
          { currency: PLN, decimals: 2, categoryId: "cat-groceries", amount: toMoney("100.00") },
        ],
      }),
    );

    expect(screen.getByText("100.00")).toBeTruthy();
  });
});
