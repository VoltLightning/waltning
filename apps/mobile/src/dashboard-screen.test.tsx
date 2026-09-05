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
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const router = { push: vi.fn(), back: vi.fn(), dismissTo: vi.fn() };
vi.mock("expo-router", () => ({
  get router() {
    return router;
  },
  useLocalSearchParams: () => ({}),
}));

// L-A — the two `client_state` updates this screen emits are its only record
// of a failure it renders around; asserting the rendered `ErrorState` proves
// the person was told and says nothing about whether anyone else was.
// `clientFailure` stays real, so the error each call carries is the one the
// screen actually built.
const emitClientDiagnosticSpy = vi.fn();
vi.mock("@waltning/client/diagnostics", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@waltning/client/diagnostics")>();
  return {
    ...actual,
    get emitClientDiagnostic() {
      return emitClientDiagnosticSpy;
    },
  };
});

/** Every `client_state` update emitted for `update`, in call order. */
function stateUpdates(update: string) {
  return emitClientDiagnosticSpy.mock.calls
    .map(([, event]) => event)
    .filter((event) => event?.scope === "client_state" && event?.update === update);
}

import Dashboard from "./dashboard-screen";
import { deskScope, displayCurrency } from "./platform";

const PLN = currencyCode("PLN");
const CHF = currencyCode("CHF");

/** A dormant foreign account — the fixture H1 is about, and the one no test had. */
const DORMANT_CHF: PhoneAccount = {
  id: id<"accounts">("44444444-4444-4444-8444-444444444444"),
  name: "Savings · CHF",
  kind: "bank",
  currency: CHF,
  decimals: 2,
  balance: toMoney("500.00"),
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
  emitClientDiagnosticSpy.mockClear();
  // §7.0's own toggle, set the way a real install's `initializeFromPinned`
  // sets it. Without this the screen would lead with the build-time pivot
  // seed, which is exactly the point: the lead currency is a preference now,
  // not whatever `netWorth` happened to sort first.
  void displayCurrency.set(PLN);
  void deskScope.set("all");
  vi.useFakeTimers({ shouldAdvanceTime: true });
  vi.setSystemTime(new Date("2026-09-04T12:00:00Z"));
});

afterEach(() => {
  vi.useRealTimers();
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

  /**
   * M4 — a blank page was the old answer, and `EmptyState`/`ErrorState` was
   * not reached at all. A database with no active layout is a failure, not a
   * quiet nothing: the seed migration exists precisely so this cannot happen.
   */
  it("says so when no layout is active, rather than rendering a blank grid", () => {
    withLedger(fakeController({ layout: null }));

    expect(screen.queryByText("Balances")).toBeNull();
    expect(screen.queryByText("Debt")).toBeNull();
    expect(screen.getByText("No dashboard layout")).toBeTruthy();
  });

  /** **L-A.** And reports it — the screen is not the only thing that needs to know. */
  it("emits `dashboard_active_layout` when no layout is active", () => {
    withLedger(fakeController({ layout: null }));

    const emitted = stateUpdates("dashboard_active_layout");
    expect(emitted, "one failure, not one per render").toHaveLength(1);
    expect(emitted[0]).toMatchObject({
      scope: "client_state",
      update: "dashboard_active_layout",
      phase: "failure",
    });
    expect(emitted[0]?.error?.message).toContain("no active dashboard layout");
  });

  /** A layout that *is* active emits nothing — the report is a failure, not a heartbeat. */
  it("emits no layout failure when a layout is active", () => {
    withLedger(fakeController({}));

    expect(stateUpdates("dashboard_active_layout")).toHaveLength(0);
    expect(stateUpdates("dashboard_unknown_widget_kind")).toHaveLength(0);
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

  /**
   * **H1.** A single dormant `CHF` account used to decide the whole
   * dashboard: `netWorth` sorts alphabetically, `CHF` sorts before `PLN`, and
   * both chart widgets silently dropped every PLN figure — a month with forty
   * transactions rendered "Nothing spent this period" under a header that
   * named no currency at all.
   *
   * The lead is §7.0's display currency now, the header says which, and the
   * other currency is listed on its own row rather than deciding anything.
   */
  it("leads with the display currency, not the alphabetically first one", () => {
    withLedger(
      fakeController({
        accounts: [ACCOUNT, DORMANT_CHF],
        spendByCategory: () => [
          { currency: CHF, decimals: 2, categoryId: null, amount: toMoney("85.00") },
          { currency: PLN, decimals: 2, categoryId: "cat-groceries", amount: toMoney("620.00") },
        ],
      }),
    );

    expect(
      screen.getByText("PLN · September 2026 · by leaf category · All"),
      "the spend widget names its own currency, period and scope",
    ).toBeTruthy();
    expect(screen.getByText("620.00"), "the PLN figure is charted").toBeTruthy();
    expect(screen.getAllByText("Other currencies").length).toBeGreaterThan(0);
    expect(screen.getByText("85.00"), "and the CHF figure is listed, not dropped").toBeTruthy();
    expect(screen.queryByText("Nothing spent this period")).toBeNull();
  });

  /**
   * **M2.** `WidgetCard`'s own doc claims every widget states its period and
   * scope; three of five stated neither, and one printed the application's
   * name where a period belongs. The three parts are required props now, so
   * this asserts the line each of the five actually renders.
   *
   * **M-A** is the other half: the three list widgets state period and scope
   * and *no* currency, because their rows each carry their own.
   */
  it("states period and scope in every widget header, and a currency only where one covers the figures", () => {
    withLedger(fakeController({}));

    const asOf = "As of September 4, 2026 · All";
    expect(screen.getAllByText(asOf), "balances, recent and debt").toHaveLength(3);
    expect(screen.getByText("PLN · September 2026 · by leaf category · All")).toBeTruthy();
    expect(screen.getByText("PLN · 5 months + this month to date · All")).toBeTruthy();
    expect(screen.queryByText(/Waltning/)).toBeNull();
  });

  /**
   * **M-A.** The three list widgets took §7.0's display currency and printed
   * it over rows that are not all in it. A ledger holding PLN and CHF renders
   * a balances list with a CHF row in it, under a header that used to read
   * `PLN · As of …` — the device preference stated in the one place a reader
   * takes it for the contents. The segment is gone, and every row still names
   * its own currency through `<Amount>`.
   */
  it("omits the currency segment on a widget whose rows carry their own", () => {
    withLedger(fakeController({ accounts: [ACCOUNT, DORMANT_CHF] }));

    expect(
      screen.getAllByText("As of September 4, 2026 · All"),
      "balances, recent and debt state period and scope only",
    ).toHaveLength(3);
    expect(
      screen.queryByText("PLN · As of September 4, 2026 · All"),
      "no header claims PLN over a list holding CHF",
    ).toBeNull();
    // The rows still answer for themselves — both accounts, both codes.
    expect(screen.getByText("Bank A · PLN")).toBeTruthy();
    expect(screen.getByText("Savings · CHF")).toBeTruthy();
    expect(screen.getAllByText("CHF").length).toBeGreaterThan(0);
    // And the two fold widgets, which chart one scale, still name it.
    expect(screen.getByText("PLN · September 2026 · by leaf category · All")).toBeTruthy();
  });

  /**
   * **H2.** On the 2nd of the month the last bucket is a two-day figure
   * standing beside five whole ones — steady income read as a collapse, every
   * month, with nothing on the widget saying the bar was not comparable.
   */
  it("names the current month partial, on the 2nd", () => {
    vi.setSystemTime(new Date("2026-09-02T12:00:00Z"));
    withLedger(
      fakeController({
        incomeVsExpense: () => [
          {
            label: "2026-08",
            currency: PLN,
            decimals: 2,
            income: toMoney("8000.00"),
            expense: toMoney("6000.00"),
          },
          {
            label: "2026-09",
            currency: PLN,
            decimals: 2,
            income: toMoney("300.00"),
            expense: toMoney("500.00"),
          },
        ],
      }),
    );

    expect(screen.getByText("PLN · 5 months + this month to date · All")).toBeTruthy();
    expect(screen.getByText("September 2026 · to date")).toBeTruthy();
    expect(screen.getByText("August 2026"), "a complete month keeps its plain name").toBeTruthy();
  });

  /**
   * **M3.** The band's scope control drove nothing: it said `All` while two
   * widget headers said `Mine` and the folds filtered `own` regardless.
   */
  it("passes the band's stored scope to the folds, and states it", () => {
    void deskScope.set("business");
    const spendByCategory = vi.fn(() => []);
    withLedger(fakeController({ spendByCategory }));

    expect(spendByCategory).toHaveBeenCalledWith(expect.anything(), "business");
    expect(screen.getByText("PLN · September 2026 · by leaf category · Business")).toBeTruthy();
  });

  /**
   * **M4.** A layout naming a kind this build cannot draw was dropped without
   * a trace; the rest of the grid still renders, but the drop is reported.
   */
  it("drops a widget kind it cannot draw, and keeps the rest", () => {
    withLedger(
      fakeController({
        layout: {
          id: "layout-1",
          name: "Standing",
          widgets: [
            { id: "w1", kind: "balances", slot: "a1", size: "m", config: {}, sort: 0 },
            { id: "w2", kind: "fx_status", slot: "a2", size: "s", config: {}, sort: 1 },
          ],
        },
      }),
    );

    expect(screen.getByText("Balances")).toBeTruthy();
  });

  /**
   * **L-A.** The drop is the only thing this build can do with a kind it has
   * no renderer for — but a widget vanishing from someone's dashboard with no
   * record is indistinguishable from a layout that never named it.
   */
  it("emits `dashboard_unknown_widget_kind`, naming every kind it dropped", () => {
    withLedger(
      fakeController({
        layout: {
          id: "layout-1",
          name: "Standing",
          widgets: [
            { id: "w1", kind: "balances", slot: "a1", size: "m", config: {}, sort: 0 },
            { id: "w2", kind: "fx_status", slot: "a2", size: "s", config: {}, sort: 1 },
            { id: "w3", kind: "budget_burn", slot: "a3", size: "s", config: {}, sort: 2 },
          ],
        },
      }),
    );

    const emitted = stateUpdates("dashboard_unknown_widget_kind");
    expect(emitted).toHaveLength(1);
    expect(emitted[0]).toMatchObject({ phase: "failure" });
    // Both, in the layout's own order — not just the first one found.
    expect(emitted[0]?.error?.message).toContain("fx_status,budget_burn");
  });

  /**
   * **L-C.** The renderable kinds are read off the record that renders them,
   * so this asserts the property that derivation buys: every kind the seeded
   * layout names draws, and none of them is reported as unrenderable.
   */
  it("treats every kind the seeded layout names as renderable", () => {
    withLedger(fakeController({}));

    expect(stateUpdates("dashboard_unknown_widget_kind")).toHaveLength(0);
    expect(screen.getByText("Balances")).toBeTruthy();
    expect(screen.getByText("Income vs expense")).toBeTruthy();
  });
});
