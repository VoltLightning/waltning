/**
 * @vitest-environment jsdom
 *
 * `Ledger` — S10's real screen, replacing the stub `screens.test.tsx` used
 * to cover. Its own file, its own fake port, following the same pattern
 * `screens.test.tsx` already established.
 *
 * **The loading skeleton has no render test here.** `useTransactionSearch`'s
 * effect runs synchronously over a local SQLite read, and
 * `@testing-library/react`'s `render()` flushes every passive effect inside
 * the same `act()` call that mounts the tree — there is no moment the public
 * render API can observe with `loaded` still `false`. The conditional itself
 * (`search.loaded ? … : <Skeleton …/>`) is read, not exercised.
 */

import { fireEvent, render, screen } from "@testing-library/react";
import {
  createPhoneLedger,
  type PhoneLedgerPort,
  type PhoneSearchTransaction,
} from "@waltning/client/ledger/create-phone-ledger";
import { deviceRuntime } from "@waltning/client/ledger/device-runtime";
import { LedgerProvider } from "@waltning/client/ledger/ledger-provider";
import { accountingDate } from "@waltning/core/date";
import { id } from "@waltning/core/id";
import { currencyCode, toMoney } from "@waltning/core/money";
import type { ReactElement } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const router = { push: vi.fn(), back: vi.fn(), dismissTo: vi.fn() };
const useLocalSearchParams = vi.fn(() => ({}) as { account?: string });

vi.mock("expo-router", () => ({
  get router() {
    return router;
  },
  useLocalSearchParams: () => useLocalSearchParams(),
}));

import Ledger from "./ledger-screen";

const PLN = currencyCode("PLN");
const ACCOUNT = id<"accounts">("11111111-1111-4111-8111-111111111111");
const TODAY = deviceRuntime().capture().date;

function expenseRow(overrides: Partial<PhoneSearchTransaction> = {}): PhoneSearchTransaction {
  return {
    id: id<"transactions">("22222222-2222-4222-8222-222222222222"),
    date: TODAY,
    type: "expense",
    payee: "Corner Bakery",
    note: "",
    categoryName: "Eating out",
    brandKey: null,
    accountId: ACCOUNT,
    accountName: "Bank A · PLN",
    toAccountId: null,
    toAccountName: null,
    amount: "-48.90000000" as never,
    currency: PLN,
    decimals: 2,
    toAmount: null,
    toCurrency: null,
    toDecimals: null,
    isBusiness: false,
    isCapital: false,
    counterpartyRole: null,
    ...overrides,
  };
}

function transferRow(): PhoneSearchTransaction {
  return {
    id: id<"transactions">("33333333-3333-4333-8333-333333333333"),
    date: accountingDate("2026-01-05"),
    type: "transfer",
    payee: "",
    note: "",
    categoryName: null,
    brandKey: null,
    accountId: ACCOUNT,
    accountName: "Cash",
    toAccountId: id<"accounts">("44444444-4444-4444-8444-444444444444"),
    toAccountName: "Bank A",
    amount: "-500.00000000" as never,
    currency: PLN,
    decimals: 2,
    toAmount: "500.00000000" as never,
    toCurrency: PLN,
    toDecimals: 2,
    isBusiness: false,
    isCapital: false,
    counterpartyRole: null,
  };
}

type FakeSearch = (
  filter: Parameters<PhoneLedgerPort["searchTransactions"]>[0],
) => ReturnType<PhoneLedgerPort["searchTransactions"]>;

function fakeController(search: FakeSearch) {
  const port: PhoneLedgerPort = {
    listAccounts: () => [],
    listCurrencies: () => [],
    listGroups: () => [],
    listRecent: () => [],
    listCategories: () => [],
    listCategoryTree: () => [],
    listCounterparties: () => [],
    listPayeeHistory: () => [],
    listNetWorth: () => [],
    readPeriodSpend: () => [],
    readSpendByCategory: () => [],
    readIncomeVsExpense: () => [],
    readActiveDashboardLayout: () => null,
    listUnsettledClearing: () => [],
    listCounterpartyBalances: () => [],
    listCounterpartyMerges: () => [],
    listDistinctCounterpartyPairs: () => [],
    balanceAsOf: () => toMoney("0"),
    searchTransactions: search,
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
    changePivot: () => ({ droppedDates: 0 }),
    setManualRate: () => ({ written: 0, replacedManual: 0 }),
    clearManualRate: () => ({ deleted: 0 }),
    updateCurrency: vi.fn(),
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
      date: TODAY,
      timeZone: "Europe/Warsaw",
      offsetMinutes: 120,
      at: new Date(),
    }),
    id: () => id("55555555-5555-4555-8555-555555555555"),
  });
}

function withLedger(element: ReactElement, controller: ReturnType<typeof fakeController>) {
  return render(<LedgerProvider controller={controller}>{element}</LedgerProvider>);
}

beforeEach(() => {
  router.push.mockClear();
  useLocalSearchParams.mockReturnValue({});
});

describe("Ledger", () => {
  it("shows the first-run empty state when nothing has ever existed", () => {
    const controller = fakeController(() => ({
      rows: [],
      nextCursor: undefined,
      total: { count: 0, currencies: [] },
    }));
    withLedger(<Ledger />, controller);

    expect(screen.getByText("No transactions yet")).toBeDefined();
  });

  it("shows the filtered empty state with the excluded count, from a route-arrived filter", () => {
    useLocalSearchParams.mockReturnValue({ account: ACCOUNT });
    const controller = fakeController((filter) => {
      const filtered = (filter.accountIds?.length ?? 0) > 0;
      return {
        rows: [],
        nextCursor: undefined,
        total: { count: filtered ? 0 : 5, currencies: [] },
      };
    });
    withLedger(<Ledger />, controller);

    expect(screen.getByText("No matching transactions")).toBeDefined();
    expect(screen.getByText("Hidden by filters: 5")).toBeDefined();
    expect(screen.getByRole("button", { name: "Clear filters" })).toBeDefined();
  });

  it("groups by day and renders a transfer as one row", () => {
    const rows = [expenseRow(), transferRow()];
    const controller = fakeController(() => ({
      rows,
      nextCursor: undefined,
      total: {
        count: rows.length,
        currencies: [
          {
            currency: PLN,
            decimals: 2,
            sum: "-548.90000000" as never,
            sumExcludingCapital: "-548.90000000" as never,
            capitalCount: 0,
          },
        ],
      },
    }));
    withLedger(<Ledger />, controller);

    expect(screen.getByText("Today")).toBeDefined();
    expect(screen.getByText("2026-01-05")).toBeDefined();
    expect(screen.getByText("Corner Bakery")).toBeDefined();
    expect(screen.getByText("Cash → Bank A")).toBeDefined();
    expect(screen.getByText("2 transactions")).toBeDefined();
  });

  it("shows a recoverable error with retry, which asks the port again", () => {
    let calls = 0;
    const controller = fakeController(() => {
      calls += 1;
      if (calls === 1) throw new Error("replica is unreadable");
      return { rows: [], nextCursor: undefined, total: { count: 0, currencies: [] } };
    });
    withLedger(<Ledger />, controller);

    expect(screen.getByText("Couldn't load your transactions")).toBeDefined();
    fireEvent.click(screen.getByRole("button", { name: "Try again" }));
    expect(calls).toBeGreaterThan(1);
    expect(screen.getByText("No transactions yet")).toBeDefined();
  });

  it("a row tap pushes the transaction detail route", () => {
    const rows = [expenseRow()];
    const controller = fakeController(() => ({
      rows,
      nextCursor: undefined,
      total: { count: 1, currencies: [] },
    }));
    withLedger(<Ledger />, controller);

    fireEvent.click(screen.getByText("Corner Bakery"));
    expect(router.push).toHaveBeenCalledWith({
      pathname: "/transaction/[id]",
      params: { id: rows[0]?.id },
    });
  });
});
