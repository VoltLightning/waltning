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

/**
 * The port's own `searchTransactions`, cursor included — a one-argument
 * stand-in was enough while nothing paged, and C1's drain pages.
 */
type FakeSearch = PhoneLedgerPort["searchTransactions"];

const ARCHIVED_SHARED = id<"accounts">("33333333-3333-4333-8333-333333333333");

const LIVE_ACCOUNT = {
  id: ACCOUNT,
  name: "Bank A · PLN",
  kind: "checking",
  currency: PLN,
  ownership: "own",
  isBusiness: false,
  archived: false,
  memo: "",
};

/** H4's own fixture — archived, and shared. Its transactions are still live. */
const ARCHIVED_SHARED_ACCOUNT = {
  id: ARCHIVED_SHARED,
  name: "Bank B · EUR",
  kind: "checking",
  currency: PLN,
  ownership: "shared",
  isBusiness: false,
  archived: true,
  memo: "",
};

function fakeController(search: FakeSearch, overrides: Partial<PhoneLedgerPort> = {}) {
  const port: PhoneLedgerPort = {
    // The real port honours `includeArchived`; the fake must too, or H4's
    // whole shape (a row whose account is only in the archived list)
    // cannot be set up at all.
    listAccounts: (options) =>
      (options?.includeArchived === true
        ? [LIVE_ACCOUNT, ARCHIVED_SHARED_ACCOUNT]
        : [LIVE_ACCOUNT]) as never,
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

  /**
   * §4 names six filter dimensions; the rail shipped with four. M (round 1):
   * currency, counterparty and an arbitrary date range join them, and the
   * rail scrolls in its own right so 1024×640 can reach the bottom of the
   * stack.
   */
  it("the rail carries every §4 dimension, inside a scroller of its own", () => {
    const controller = fakeController(() => ({
      rows: [],
      nextCursor: undefined,
      total: { count: 0, currencies: [] },
    }));
    withLedger(<Ledger />, controller);

    // `Select`'s trigger names itself "<field>: <value>" once it has one,
    // and both of these open on their own "every one of them" option.
    expect(screen.getAllByRole("button", { name: /Currency/ }).length).toBeGreaterThan(0);
    expect(screen.getAllByRole("button", { name: /Person or company/ }).length).toBeGreaterThan(0);
    // §4's arbitrary range — reachable at desk width only through the rail,
    // since the desk branch never opens the phone's bottom sheet.
    expect(screen.getByLabelText("From")).toBeDefined();
    expect(screen.getByLabelText("To")).toBeDefined();

    // `react-native-web` renders a `ScrollView` as a scrolling div; the
    // assertion is that the rail *is* one, not that jsdom computed a
    // particular `overflow` for it.
    const rail = screen.getByTestId("ledger-desk-rail");
    expect(rail.className).toMatch(/r-overflow/);
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

  /* ── C1 · the table loads the whole filtered period ─────────────────── */

  /**
   * A paged fake, fifty rows at a time, exactly as `search_transactions`
   * pages. The largest amount lives in the *last* generated row: a sort that
   * only ever saw a first page — the C1 bug — could not promote it, and the
   * `FlatList` renders only its first fifty, so finding that payee on screen
   * at all is the assertion.
   */
  function thousandRowPort(count: number) {
    const rows = Array.from({ length: count }, (_, i) => {
      const last = i === count - 1;
      const cents = String((i * 37) % 9500).padStart(3, "0");
      return expenseRow({
        id: id<"transactions">(`00000000-0000-4000-8000-${String(i).padStart(12, "0")}`),
        payee: last ? "Peak payee" : `Row ${i}`,
        amount: (last
          ? "-999999.00000000"
          : `-${cents.slice(0, -2)}.${cents.slice(-2)}0000`) as never,
      });
    });
    const searchTransactions = vi.fn<FakeSearch>((_filter, cursor) => {
      const start = cursor === undefined ? 0 : rows.findIndex((row) => row.id === cursor.id) + 1;
      const page = rows.slice(start, start + 50);
      const last = page[page.length - 1];
      return {
        rows: page,
        nextCursor:
          start + page.length < rows.length && last !== undefined
            ? { date: last.date, id: last.id }
            : undefined,
        total: { count: rows.length, currencies: [] },
      };
    });
    return { rows, searchTransactions };
  }

  it("loads every page of the filtered period, and sorts by amount over all 1,000", () => {
    const { searchTransactions } = thousandRowPort(1000);
    const controller = fakeController(searchTransactions);

    const started = performance.now();
    withLedger(<Ledger />, controller);
    // Row 999 is far past the `FlatList`'s own first window — not on screen
    // until the sort brings it to the top.
    expect(screen.queryByText("Peak payee")).toBeNull();

    // One click — ascending. Every row here is an expense, so the largest
    // magnitude is the *smallest* signed amount and sorts to the top.
    fireEvent.click(screen.getByRole("button", { name: "Amount" }));
    const elapsed = performance.now() - started;

    expect(screen.getByText("Peak payee")).toBeDefined();
    // Twenty pages of fifty — the whole period, not the first page.
    expect(searchTransactions.mock.calls.length).toBeGreaterThanOrEqual(20);
    // Generous on purpose: this asserts "no accidental O(n²) and no per-row
    // re-query", not real-device latency. `packages/core`'s own
    // `ledger-table.perf.test.ts` budgets the comparator itself.
    expect(elapsed).toBeLessThan(10_000);
  });

  it("past the cap it says so — the header and a banner both, never a silent truncation", () => {
    const { searchTransactions } = thousandRowPort(5100);
    const controller = fakeController(searchTransactions);
    withLedger(<Ledger />, controller);

    expect(screen.getByText(/showing/)).toBeDefined();
    expect(screen.getByRole("alert").textContent).toMatch(/Narrow the filter/);
  });

  /* ── C2 layer 1 · a mixed batch never reaches a category tree ────────── */

  it("a selection spanning income and expense is refused before the tree opens", () => {
    const rows = [
      expenseRow({ id: id("aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa"), payee: "An expense" }),
      expenseRow({
        id: id("bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb"),
        payee: "An income",
        type: "income",
        amount: "9200.00000000" as never,
      }),
    ];
    const categorizeBatch = vi.fn<PhoneLedgerPort["categorizeBatch"]>(() => undefined);
    const controller = fakeController(
      () => ({ rows, nextCursor: undefined, total: { count: 2, currencies: [] } }),
      { categorizeBatch },
    );
    withLedger(<Ledger />, controller);

    fireEvent.click(screen.getByRole("checkbox", { name: "Select An expense" }));
    fireEvent.click(screen.getByRole("checkbox", { name: "Select An income" }));

    expect(screen.getByRole("alert").textContent).toMatch(/income and expense/);

    fireEvent.click(screen.getByText("Categorise"));
    // No tree, no confirm, no write — the refusal is the first layer of three.
    expect(screen.queryByRole("radio")).toBeNull();
    expect(categorizeBatch).not.toHaveBeenCalled();
  });

  it("an all-income selection is offered the income tree, not the expense one", () => {
    const rows = [
      expenseRow({
        id: id("bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb"),
        payee: "An income",
        type: "income",
        amount: "9200.00000000" as never,
      }),
    ];
    const controller = fakeController(
      () => ({ rows, nextCursor: undefined, total: { count: 1, currencies: [] } }),
      {
        listCategoryTree: () => [
          {
            id: id<"categories">("77777777-7777-4777-8777-777777777777"),
            parentId: null,
            name: "Salary",
            kind: "income",
            isLeaf: true,
            sort: 0,
          },
          {
            id: EATING_OUT,
            parentId: null,
            name: "Eating out",
            kind: "expense",
            isLeaf: true,
            sort: 1,
          },
        ],
      },
    );
    withLedger(<Ledger />, controller);

    fireEvent.click(screen.getByRole("checkbox", { name: "Select An income" }));
    fireEvent.click(screen.getByText("Categorise"));

    expect(screen.getByRole("radio", { name: /Salary/ })).toBeDefined();
    expect(screen.queryByRole("radio", { name: /Eating out/ })).toBeNull();
  });

  /* ── H4 · an archived shared account still reads as shared ───────────── */

  it("a row in an archived shared account is scoped Shared, not Mine", () => {
    const rows = [
      expenseRow({
        id: id("aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa"),
        payee: "Old shared row",
        accountId: ARCHIVED_SHARED,
        accountName: "Bank B · EUR",
      }),
    ];
    const controller = fakeController(() => ({
      rows,
      nextCursor: undefined,
      total: { count: 1, currencies: [] },
    }));
    withLedger(<Ledger />, controller);

    // The scope *filter* joins accounts in SQL with no archived exclusion, so
    // this row answers "Shared" there; the column must agree with it. Both
    // words also appear once each as scope segments in the rail, so the
    // counts — not their presence — are what distinguish the row's own cell.
    expect(screen.getAllByText("Shared")).toHaveLength(2);
    expect(screen.getAllByText("Mine")).toHaveLength(1);
  });

  /* ── H5 · the period label is the filter ─────────────────────────────── */

  it("first paint applies the current month, and Clear all returns the label to All time", () => {
    const seen: { from: string | undefined; to: string | undefined }[] = [];
    // One row, not none: the empty state asks `searchTransactions({})` for an
    // unfiltered count of its own, which would land in `seen` as a phantom
    // "no date filter" call.
    const rows = [expenseRow()];
    const controller = fakeController((filter) => {
      seen.push({ from: filter.from, to: filter.to });
      return { rows, nextCursor: undefined, total: { count: 1, currencies: [] } };
    });
    withLedger(<Ledger />, controller);

    // An unparseable or absent date is dropped on the way to the port
    // (`create-phone-ledger.ts`'s own `isAccountingDate` guard), so a real
    // month filter arrives as two real dates and no filter arrives as none.
    const applied = seen[seen.length - 1];
    expect(applied?.from).toBe(`${TODAY.slice(0, 7)}-01`);
    expect(applied?.to).toBeDefined();
    // The stepper names the month it is actually filtering.
    expect(screen.getByText(/2026/)).toBeDefined();

    fireEvent.click(screen.getByRole("button", { name: "Clear all" }));

    expect(screen.getByText("All time")).toBeDefined();
    const cleared = seen[seen.length - 1];
    expect(cleared?.from).toBeUndefined();
    expect(cleared?.to).toBeUndefined();
  });

  /* ── H6 · a range holds only what is checked ─────────────────────────── */

  it("a shift-click range skips a transfer, and the count matches the checkboxes", () => {
    const rows = [
      expenseRow({ id: id("aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa"), payee: "Row A" }),
      expenseRow({
        id: id("dddddddd-dddd-4ddd-8ddd-dddddddddddd"),
        payee: "A transfer",
        type: "transfer",
        toAccountName: "Cash",
      }),
      expenseRow({ id: id("cccccccc-cccc-4ccc-8ccc-cccccccccccc"), payee: "Row C" }),
    ];
    const controller = fakeController(() => ({
      rows,
      nextCursor: undefined,
      total: { count: rows.length, currencies: [] },
    }));
    withLedger(<Ledger />, controller);

    fireEvent.click(screen.getByRole("checkbox", { name: "Select Row A" }));
    fireEvent.click(screen.getByRole("checkbox", { name: "Select Row C" }), { shiftKey: true });

    // Two checkboxes exist and two are checked — the transfer has none, so a
    // count of three would name a row the reader cannot see or unselect.
    expect(screen.getByText("2 selected")).toBeDefined();
    const checked = screen
      .getAllByRole("checkbox")
      .filter((box) => box.getAttribute("aria-checked") === "true");
    expect(checked).toHaveLength(2);
  });

  /* ── M · the confirm states what is being overwritten ────────────────── */

  it("the confirm names the categories the batch is leaving, and what already matches", () => {
    const rows = [
      expenseRow({
        id: id("aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa"),
        payee: "Row A",
        categoryName: "Groceries",
      }),
      expenseRow({
        id: id("bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb"),
        payee: "Row B",
        categoryName: null,
      }),
      expenseRow({
        id: id("cccccccc-cccc-4ccc-8ccc-cccccccccccc"),
        payee: "Row C",
        categoryName: "Eating out",
      }),
    ];
    const controller = fakeController(() => ({
      rows,
      nextCursor: undefined,
      total: { count: rows.length, currencies: [] },
    }));
    withLedger(<Ledger />, controller);

    fireEvent.click(screen.getByRole("checkbox", { name: "Select Row A" }));
    fireEvent.click(screen.getByRole("checkbox", { name: "Select Row C" }), { shiftKey: true });
    fireEvent.click(screen.getByText("Categorise"));
    fireEvent.click(screen.getByRole("radio", { name: /Eating out/ }));

    expect(
      screen.getByText("from Groceries, Uncategorised, Eating out → Eating out"),
    ).toBeDefined();
    expect(screen.getByText("1 row already Eating out")).toBeDefined();
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
