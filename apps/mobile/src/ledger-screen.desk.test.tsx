/**
 * @vitest-environment jsdom
 *
 * `Ledger` at desk width — S10 §3/§7 web. `ledger-screen.test.tsx` covers
 * the phone body (the default jsdom width, well under `breakpoint.desk`);
 * this file resizes to prove the desk branch, the same `resizeTo` real-resize
 * technique `use-breakpoint.test.tsx` uses rather than mocking the hook.
 */

import { fireEvent, render, screen } from "@testing-library/react";
import {
  createPhoneLedger,
  type PhoneLedgerPort,
  type PhoneSearchTransaction,
} from "@waltning/client/ledger/create-phone-ledger";
import { deviceRuntime } from "@waltning/client/ledger/device-runtime";
import { LedgerProvider } from "@waltning/client/ledger/ledger-provider";
import { id } from "@waltning/core/id";
import { currencyCode, toMoney } from "@waltning/core/money";
import type { ReactElement } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

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
const EATING_OUT = id<"categories">("66666666-6666-4666-8666-666666666666");
const TODAY = deviceRuntime().capture().date;

function expenseRow(overrides: Partial<PhoneSearchTransaction> = {}): PhoneSearchTransaction {
  return {
    id: id<"transactions">("22222222-2222-4222-8222-222222222222"),
    date: TODAY,
    type: "expense",
    payee: "Corner Bakery",
    note: "",
    categoryName: "Eating out",
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

type FakeSearch = (
  filter: Parameters<PhoneLedgerPort["searchTransactions"]>[0],
) => ReturnType<PhoneLedgerPort["searchTransactions"]>;

function fakeController(search: FakeSearch, overrides: Partial<PhoneLedgerPort> = {}) {
  const port: PhoneLedgerPort = {
    listAccounts: () => [
      {
        id: ACCOUNT,
        name: "Bank A · PLN",
        kind: "checking",
        currency: PLN,
        ownership: "own",
        isBusiness: false,
        archived: false,
        memo: "",
      } as never,
    ],
    listCurrencies: () => [],
    listGroups: () => [],
    listRecent: () => [],
    listCategories: () => [{ id: EATING_OUT, name: "Eating out", kind: "expense" } as never],
    listCategoryTree: () => [
      {
        id: EATING_OUT,
        parentId: null,
        name: "Eating out",
        kind: "expense",
        isLeaf: true,
        sort: 0,
      },
    ],
    listCounterparties: () => [],
    listPayeeHistory: () => [],
    listNetWorth: () => [],
    readPeriodSpend: () => [],
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
    ...overrides,
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

/** `use-breakpoint.test.tsx`'s own real-resize technique. */
function resizeTo(width: number) {
  Object.defineProperty(document.documentElement, "clientWidth", {
    value: width,
    configurable: true,
  });
  window.dispatchEvent(new Event("resize"));
}

beforeEach(() => {
  router.push.mockClear();
  useLocalSearchParams.mockReturnValue({});
  resizeTo(1440);
});

afterEach(() => {
  resizeTo(390);
});

describe("Ledger at desk width", () => {
  it("renders the table's column headers instead of the phone list", () => {
    const rows = [expenseRow()];
    const controller = fakeController(() => ({
      rows,
      nextCursor: undefined,
      total: { count: 1, currencies: [] },
    }));
    withLedger(<Ledger />, controller);

    expect(screen.getByRole("button", { name: "Payee" })).toBeDefined();
    expect(screen.getByRole("button", { name: "Amount" })).toBeDefined();
    expect(screen.getByText("Corner Bakery")).toBeDefined();
  });

  it("shows the filter rail — search, period stepper, accounts, categories, scope", () => {
    const controller = fakeController(() => ({
      rows: [],
      nextCursor: undefined,
      total: { count: 0, currencies: [] },
    }));
    withLedger(<Ledger />, controller);

    expect(screen.getByRole("searchbox")).toBeDefined();
    expect(screen.getByLabelText("Previous period")).toBeDefined();
    expect(screen.getAllByRole("button", { name: "Account" }).length).toBeGreaterThan(0);
    expect(screen.getAllByRole("button", { name: "Category" }).length).toBeGreaterThan(0);
  });

  it("a filter arriving from another screen is shown as a chip in the rail, not applied silently", () => {
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

    // The rail's own `MultiSelect` shows the account as its selected token —
    // the "shown, not silently applied" treatment at desk width (S10 §3 web).
    expect(screen.getByText("Bank A · PLN")).toBeDefined();
    expect(screen.getByRole("button", { name: "Clear all" })).toBeDefined();
  });

  it("sorting by a column header reorders the rows", () => {
    const rows = [
      expenseRow({ id: id("aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa"), payee: "Zed", date: TODAY }),
      expenseRow({ id: id("bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb"), payee: "Abe", date: TODAY }),
    ];
    const controller = fakeController(() => ({
      rows,
      nextCursor: undefined,
      total: { count: 2, currencies: [] },
    }));
    withLedger(<Ledger />, controller);

    fireEvent.click(screen.getByRole("button", { name: "Payee" }));
    const cells = screen.getAllByText(/^(Zed|Abe)$/);
    expect(cells.map((cell) => cell.textContent)).toEqual(["Abe", "Zed"]);
  });

  it("a row click pushes the transaction detail route", () => {
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

  it("shift-click selects a range, and a batch categorise lands as one categorize_batch call", () => {
    const rows = [
      expenseRow({ id: id("aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa"), payee: "Row A" }),
      expenseRow({ id: id("bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb"), payee: "Row B" }),
      expenseRow({ id: id("cccccccc-cccc-4ccc-8ccc-cccccccccccc"), payee: "Row C" }),
    ];
    const categorizeBatch = vi.fn<PhoneLedgerPort["categorizeBatch"]>(() => undefined);
    const controller = fakeController(
      () => ({ rows, nextCursor: undefined, total: { count: rows.length, currencies: [] } }),
      { categorizeBatch },
    );
    withLedger(<Ledger />, controller);

    fireEvent.click(screen.getByRole("checkbox", { name: "Select Row A" }));
    fireEvent.click(screen.getByRole("checkbox", { name: "Select Row C" }), { shiftKey: true });

    expect(screen.getByText("3 selected")).toBeDefined();

    fireEvent.click(screen.getByText("Categorise"));
    fireEvent.click(screen.getByRole("radio", { name: /Eating out/ }));

    expect(screen.getByText("Categorise 3 transactions as Eating out?")).toBeDefined();

    fireEvent.click(screen.getByText("Approve"));

    expect(categorizeBatch).toHaveBeenCalledTimes(1);
    const [input] = categorizeBatch.mock.calls[0] ?? [];
    expect(new Set(input?.transactionIds)).toEqual(new Set(rows.map((row) => row.id)));
    expect(input?.categoryId).toBeDefined();
    expect(screen.getByText("3 transactions recategorised")).toBeDefined();
    // The selection cleared on approve — the bar renders nothing at count 0.
    expect(screen.queryByText(/selected/)).toBeNull();
  });

  it("J then Enter opens the first row via the keyboard alone", () => {
    const rows = [expenseRow()];
    const controller = fakeController(() => ({
      rows,
      nextCursor: undefined,
      total: { count: 1, currencies: [] },
    }));
    withLedger(<Ledger />, controller);

    const scroller = screen.getByTestId("ledger-table-scroller");
    fireEvent.keyDown(scroller, { key: "j" });
    fireEvent.keyDown(scroller, { key: "Enter" });

    expect(router.push).toHaveBeenCalledWith({
      pathname: "/transaction/[id]",
      params: { id: rows[0]?.id },
    });
  });
});
