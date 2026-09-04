/**
 * @vitest-environment jsdom
 *
 * The three route screens, rendered under `react-native-web` — which no test
 * could do while each read a module singleton: the ledger arrives through
 * `<LedgerProvider>` now, so a test hands the same screens an in-memory
 * controller and the screens cannot tell.
 *
 * The router is the one platform edge left, and it is mocked rather than
 * wrapped: what these tests assert is what the screens *show* for a given
 * ledger, and where they *ask* to go — not expo-router's own behaviour.
 */

import { act, fireEvent, render, screen } from "@testing-library/react";
import {
  createPhoneLedger,
  type PhoneClearingAccount,
  type PhoneLedgerPort,
  type PhoneNetWorth,
} from "@waltning/client/ledger/create-phone-ledger";
import { LedgerProvider } from "@waltning/client/ledger/ledger-provider";
import { accountingDate } from "@waltning/core/date";
import { type Id, id } from "@waltning/core/id";
import {
  type BalanceRow,
  type CurrencyCode,
  currencyCode,
  type Money,
  netWorth,
  type PeriodSpendRow,
  toMoney,
  unsettledClearing,
} from "@waltning/core/money";
import type { ReactElement } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const router = { push: vi.fn(), back: vi.fn(), dismissTo: vi.fn() };
const useLocalSearchParams = vi.fn(() => ({}));

vi.mock("expo-router", () => ({
  get router() {
    return router;
  },
  useLocalSearchParams: () => useLocalSearchParams(),
}));

import NewAccount from "./account-creation-screen";
import CalendarStub from "./calendar-screen";
import CategoriesScreen from "./categories-screen";
import QuickAdd from "./quick-add-screen";
import SettingsScreen from "./settings-screen";
import Today from "./today-screen";

type FakeAccount = {
  id: ReturnType<typeof id<"accounts">>;
  name: string;
  kind: "bank" | "clearing";
  currency: CurrencyCode;
  decimals: number;
  balance: Money;
  groupId: null;
  ownership: "own" | "shared";
  isBusiness: false;
  archived: false;
  expectedBalance: null;
  openingBalance: Money;
  openingDate: null;
  memo: "";
  version: number;
  capturable: boolean;
};

/**
 * `money.netWorth` (§3) over the fake accounts, per currency — the same fold
 * `read-net-worth.ts` runs on the replica, so the fake port answers `Today`
 * with the identical figures a real session would for this data.
 */
function netWorthOf(accounts: readonly FakeAccount[]): readonly PhoneNetWorth[] {
  const byCurrency = new Map<CurrencyCode, { decimals: number; rows: BalanceRow[] }>();
  for (const account of accounts) {
    const bucket = byCurrency.get(account.currency) ?? { decimals: account.decimals, rows: [] };
    bucket.rows.push({ ownership: account.ownership, balance: account.balance });
    byCurrency.set(account.currency, bucket);
  }
  return [...byCurrency.entries()].map(([currency, { decimals, rows }]) => ({
    currency,
    decimals,
    ...netWorth(rows),
    hasShared: rows.some((row) => row.ownership === "shared"),
  }));
}

/**
 * `money.unsettledClearing` (§8) over the clearing-kind fake accounts.
 *
 * **Fakes a non-null oldest id, no payee, on purpose.** This fixture never
 * folds real legs through `fifoOldestOpen` — a `null` id would now read as
 * "the oldest open entry is the account's opening balance" (H2), a specific
 * claim this generic fake has no basis for. Naming a fake transaction id
 * instead keeps it in the ordinary, unnamed-leg branch every test written
 * against this helper already expects.
 */
function unsettledOf(accounts: readonly FakeAccount[]): readonly PhoneClearingAccount[] {
  return unsettledClearing(
    accounts
      .filter((account) => account.kind === "clearing")
      .map((account) => ({
        accountId: account.id,
        name: account.name,
        currency: account.currency,
        decimals: account.decimals,
        balance: account.balance,
      })),
  ).map((row) => ({
    ...row,
    oldestUnconsumedTransactionId: id<"transactions">(`unsettled-${row.accountId}`),
    oldestDate: accountingDate("2026-08-01"),
    oldestUnconsumedRemainder: row.balance,
    oldestUnconsumedPayee: null,
  }));
}

/**
 * The real controller over an in-memory port — the same shape the app wires.
 *
 * `periodSpendRows` is fixed rather than derived from the fake transactions:
 * nothing in this fixture tracks a transaction's date or type well enough to
 * fold `money.periodSpend` over it faithfully, and a fold that quietly
 * ignored the period argument would test the wrong thing. Callers that care
 * about the *spent* and *net* tiles hand the figures they want asserted.
 */
type FakeCategory = {
  id: Id<"categories">;
  parentId: Id<"categories"> | null;
  name: string;
  kind: "income" | "expense";
  isLeaf: boolean;
  archived: boolean;
  sort: number;
  depth: number;
  version: number;
  externalId: string | null;
};

/** A category fixture, `version: 1` unless a test bumps it — plain string ids, branded here. */
function fakeCategory(
  overrides: Partial<Omit<FakeCategory, "id" | "parentId">> & {
    id: string;
    parentId?: string | null;
    name: string;
    kind: "income" | "expense";
  },
): FakeCategory {
  return {
    isLeaf: true,
    archived: false,
    sort: 0,
    depth: 0,
    version: 1,
    externalId: null,
    ...overrides,
    id: id<"categories">(overrides.id),
    parentId: overrides.parentId ? id<"categories">(overrides.parentId) : null,
  };
}

function fakeController(
  initialAccounts: readonly FakeAccount[] = [],
  periodSpendRows: readonly PeriodSpendRow[] = [],
  initialCategories: readonly FakeCategory[] = [],
  categoryUsage: ReadonlyMap<Id<"categories">, number> = new Map(),
  /** H2 — a caller testing the opening-balance banner hands its own rows rather than `unsettledOf`'s generic ones. */
  unsettledOverride?: readonly PhoneClearingAccount[],
) {
  let accounts = [...initialAccounts];
  let categoryTree: FakeCategory[] = [...initialCategories];
  const bumpCategory = (categoryId: Id<"categories">, patch: Partial<FakeCategory>) => {
    categoryTree = categoryTree.map((node) =>
      node.id === categoryId ? { ...node, ...patch, version: node.version + 1 } : node,
    );
  };
  const port: PhoneLedgerPort = {
    listAccounts: () => accounts,
    listCurrencies: () => [
      {
        code: currencyCode("PLN"),
        name: "Polish Złoty",
        symbol: "zł",
        decimals: 2,
        capturable: true,
        isPivot: true,
      },
    ],
    listGroups: () => [],
    listRecent: () => [],
    listCategories: () => [],
    listCategoryTree: () => [],
    listFullCategoryTree: () => categoryTree,
    listCategoryUsage: () => categoryUsage,
    readCategoryReferenceCounts: () => ({ transactions: 0, lines: 0, rules: 0 }),
    listCounterparties: () => [],
    listPayeeHistory: () => [],
    listNetWorth: () => netWorthOf(accounts),
    readPeriodSpend: () => periodSpendRows,
    listUnsettledClearing: () => unsettledOverride ?? unsettledOf(accounts),
    listCounterpartyBalances: () => [],
    listCounterpartyMerges: () => [],
    listDistinctCounterpartyPairs: () => [],
    balanceAsOf: () => toMoney("0"),
    // No screen under test here drives S10 yet (`ledger-screen.test.tsx`
    // does) — an empty page and a no-op are enough to satisfy the port.
    searchTransactions: () => ({
      rows: [],
      nextCursor: undefined,
      total: { count: 0, currencies: [] },
    }),
    categorizeBatch: () => undefined,
    createAccount: (input) => {
      accounts = [
        ...accounts,
        {
          id: input.id,
          name: input.name,
          kind: input.kind === "clearing" ? "clearing" : "bank",
          currency: input.currency,
          decimals: 2,
          balance: input.openingBalance,
          capturable: true,
          groupId: null,
          ownership: input.ownership,
          isBusiness: false,
          archived: false,
          expectedBalance: null,
          openingBalance: input.openingBalance,
          openingDate: null,
          memo: "",
          version: 1,
        },
      ];
    },
    createTransaction: () => undefined,
    createCategory: () => undefined,
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
    changePivot: () => undefined,
    setManualRate: () => ({ written: 0, replacedManual: 0 }),
    clearManualRate: () => ({ deleted: 0 }),
    updateCurrency: vi.fn(),
    createCounterparty: () => undefined,
    updateCounterparty: () => undefined,
    mergeCounterparties: () => undefined,
    unmergeCounterparties: () => undefined,
    recordDistinctCounterparties: () => undefined,
    settleDebt: () => ({ residual: toMoney("0"), overSettled: false }),
    renameCategory: (input) => bumpCategory(input.id, { name: input.name }),
    reparentCategory: (input) => bumpCategory(input.id, { parentId: input.parentId }),
    convertLeafGroup: (input) => bumpCategory(input.id, { isLeaf: input.to === "leaf" }),
    mergeCategories: (input) => bumpCategory(input.loserId, { archived: true }),
    archiveCategory: (input) => bumpCategory(input.id, { archived: true }),
    reset: () => {
      accounts = [];
    },
  };
  return createPhoneLedger(port, {
    capture: () => ({
      date: accountingDate("2026-09-03"),
      timeZone: "Europe/Warsaw",
      offsetMinutes: 120,
      at: new Date("2026-09-03T10:00:00Z"),
    }),
    id: () => id("11111111-1111-4111-8111-111111111111"),
  });
}

const PLN_ACCOUNT: FakeAccount = {
  id: id<"accounts">("22222222-2222-4222-8222-222222222222"),
  name: "Bank A · PLN",
  kind: "bank",
  currency: currencyCode("PLN"),
  decimals: 2,
  balance: toMoney("50"),
  groupId: null,
  ownership: "own",
  isBusiness: false,
  archived: false,
  expectedBalance: null,
  openingBalance: toMoney("0"),
  openingDate: null,
  memo: "",
  version: 1,
  capturable: true,
};

const SHARED_ACCOUNT: FakeAccount = {
  id: id<"accounts">("33333333-3333-4333-8333-333333333333"),
  name: "Household · PLN",
  kind: "bank",
  currency: currencyCode("PLN"),
  decimals: 2,
  balance: toMoney("100"),
  groupId: null,
  ownership: "shared",
  isBusiness: false,
  archived: false,
  expectedBalance: null,
  openingBalance: toMoney("0"),
  openingDate: null,
  memo: "",
  version: 1,
  capturable: true,
};

const CLEARING_ACCOUNT: FakeAccount = {
  id: id<"accounts">("44444444-4444-4444-8444-444444444444"),
  name: "Shared clearing",
  kind: "clearing",
  currency: currencyCode("PLN"),
  decimals: 2,
  balance: toMoney("340"),
  groupId: null,
  ownership: "own",
  isBusiness: false,
  archived: false,
  expectedBalance: null,
  openingBalance: toMoney("0"),
  openingDate: null,
  memo: "",
  version: 1,
  capturable: true,
};

const SECOND_CLEARING_ACCOUNT: FakeAccount = {
  id: id<"accounts">("55555555-5555-4555-8555-555555555555"),
  name: "Cash float",
  kind: "clearing",
  currency: currencyCode("PLN"),
  decimals: 2,
  balance: toMoney("12"),
  groupId: null,
  ownership: "own",
  isBusiness: false,
  archived: false,
  expectedBalance: null,
  openingBalance: toMoney("0"),
  openingDate: null,
  memo: "",
  version: 1,
  capturable: true,
};

function withLedger(element: ReactElement, controller = fakeController()) {
  return render(<LedgerProvider controller={controller}>{element}</LedgerProvider>);
}

beforeEach(() => {
  router.push.mockClear();
  router.back.mockClear();
  router.dismissTo.mockClear();
  useLocalSearchParams.mockReturnValue({});
});

describe("Today", () => {
  it("renders the empty ledger with a create-account action that navigates", () => {
    withLedger(<Today />);

    expect(screen.getByText("No accounts yet")).toBeDefined();
    fireEvent.click(screen.getByText("Create account"));
    expect(router.push).toHaveBeenCalledWith({
      pathname: "/account/new",
      params: { returnTo: "today" },
    });
  });

  it("shows the ledger once an account exists", () => {
    withLedger(<Today />, fakeController([PLN_ACCOUNT]));

    expect(screen.queryByText("No accounts yet")).toBeNull();
    expect(screen.getByText("Recent")).toBeDefined();
  });

  it("shows mine and ours from net worth, per currency — never a summed total", () => {
    withLedger(<Today />, fakeController([PLN_ACCOUNT, SHARED_ACCOUNT]));

    expect(screen.getByText("mine")).toBeDefined();
    expect(screen.getByText("ours")).toBeDefined();
    const rendered = document.body.textContent ?? "";
    // mine: PLN_ACCOUNT alone (50). ours: both accounts (50 + 100 = 150).
    expect(rendered).toContain("50.00");
    expect(rendered).toContain("150.00");
  });

  /**
   * `DualTotal`'s own contract: `ours: null`, not the same figure as `mine`,
   * when no shared account exists — never a household total printed twice.
   */
  it("shows one figure, not ours repeated, when the ledger holds no shared account", () => {
    withLedger(<Today />, fakeController([PLN_ACCOUNT]));

    expect(screen.getByText("mine")).toBeDefined();
    expect(screen.queryByText("ours")).toBeNull();
  });

  /**
   * §12: `spent` is §5's positive `spend` magnitude, not a signed delta — a
   * 120.50 expense renders as `120.50`, never `-120.50`.
   */
  it("shows the period row's spent and net tiles from periodSpend, spend as a positive magnitude", () => {
    const rows: readonly PeriodSpendRow[] = [
      {
        currency: currencyCode("PLN"),
        decimals: 2,
        spend: toMoney("120.50"),
        net: toMoney("40.00"),
      },
    ];
    withLedger(<Today />, fakeController([PLN_ACCOUNT], rows));

    expect(screen.getByText("spent")).toBeDefined();
    expect(screen.getByText("net")).toBeDefined();
    const rendered = document.body.textContent ?? "";
    expect(rendered).toContain("120.50");
    expect(rendered).not.toContain("-120.50");
    expect(rendered).toContain("40.00");
  });

  it("shows the unsettled banner and opens the named transaction", () => {
    withLedger(<Today />, fakeController([PLN_ACCOUNT, CLEARING_ACCOUNT]));

    expect(screen.getByRole("alert")).toBeDefined();
    fireEvent.click(screen.getByText("Open"));
    expect(router.push).toHaveBeenCalledWith({
      pathname: "/transaction/[id]",
      params: { id: id<"transactions">(`unsettled-${CLEARING_ACCOUNT.id}`) },
    });
  });

  /**
   * H2 — when the oldest unconsumed entry is the account's own opening
   * balance rather than a transaction, `oldestUnconsumedTransactionId` is
   * `null`: there is no transaction to name or to open, so the banner says
   * so and `Open` falls back to the account's own filtered ledger.
   */
  it("shows the opening-balance banner and falls back to the filtered ledger", () => {
    const controller = fakeController([PLN_ACCOUNT, CLEARING_ACCOUNT], [], [], new Map(), [
      {
        accountId: CLEARING_ACCOUNT.id,
        name: CLEARING_ACCOUNT.name,
        currency: CLEARING_ACCOUNT.currency,
        decimals: CLEARING_ACCOUNT.decimals,
        balance: CLEARING_ACCOUNT.balance,
        oldestUnconsumedTransactionId: null,
        oldestDate: accountingDate("2026-08-01"),
        oldestUnconsumedRemainder: CLEARING_ACCOUNT.balance,
        oldestUnconsumedPayee: null,
      },
    ]);
    withLedger(<Today />, controller);

    const rendered = document.body.textContent ?? "";
    expect(rendered).toContain("opening balance");
    fireEvent.click(screen.getByText("Open"));
    expect(router.push).toHaveBeenCalledWith({
      pathname: "/ledger",
      params: { account: CLEARING_ACCOUNT.id },
    });
  });

  /**
   * §8's own reason for existing — `find_unsettled`'s third field — once
   * `readUnsettledClearing` names a payee: the banner names the transaction,
   * not the account, and `Open` goes straight there (S04 §3 Shared).
   */
  it("names the transaction once fifoOldestOpen finds one, and Open goes straight to it", () => {
    const oldestId = id<"transactions">("66666666-6666-4666-8666-666666666666");
    const port: PhoneLedgerPort = {
      listAccounts: () => [PLN_ACCOUNT],
      listCurrencies: () => [
        {
          code: currencyCode("PLN"),
          name: "Polish Złoty",
          symbol: "zł",
          decimals: 2,
          capturable: true,
          isPivot: true,
        },
      ],
      listGroups: () => [],
      listRecent: () => [],
      listCategories: () => [],
      listCategoryTree: () => [],
      listCounterparties: () => [],
      listNetWorth: () => netWorthOf([PLN_ACCOUNT]),
      readPeriodSpend: () => [],
      listUnsettledClearing: () => [
        {
          accountId: CLEARING_ACCOUNT.id,
          name: CLEARING_ACCOUNT.name,
          currency: CLEARING_ACCOUNT.currency,
          decimals: CLEARING_ACCOUNT.decimals,
          balance: CLEARING_ACCOUNT.balance,
          oldestUnconsumedTransactionId: oldestId,
          oldestDate: accountingDate("2026-08-05"),
          oldestUnconsumedRemainder: CLEARING_ACCOUNT.balance,
          oldestUnconsumedPayee: "Dinner",
        },
      ],
      listCounterpartyBalances: () => [],
      listCounterpartyMerges: () => [],
      listDistinctCounterpartyPairs: () => [],
      balanceAsOf: () => toMoney("0"),
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
      updateCurrency: vi.fn(),
      createCounterparty: vi.fn(),
      updateCounterparty: vi.fn(),
      mergeCounterparties: vi.fn(),
      unmergeCounterparties: vi.fn(),
      recordDistinctCounterparties: vi.fn(),
      settleDebt: vi.fn(() => ({ residual: toMoney("0"), overSettled: false })),
      listPayeeHistory: vi.fn(() => []),
      listFullCategoryTree: vi.fn(() => []),
      listCategoryUsage: vi.fn(() => new Map()),
      readCategoryReferenceCounts: vi.fn(() => ({ transactions: 0, lines: 0, rules: 0 })),
      renameCategory: vi.fn(),
      reparentCategory: vi.fn(),
      convertLeafGroup: vi.fn(),
      mergeCategories: vi.fn(),
      archiveCategory: vi.fn(),
      readCrossRate: vi.fn(() => null),
      listCurrencySettings: vi.fn(() => []),
      reset: vi.fn(),
    };
    const controller = createPhoneLedger(port, {
      capture: () => ({
        date: accountingDate("2026-09-03"),
        timeZone: "Europe/Warsaw",
        offsetMinutes: 120,
        at: new Date("2026-09-03T10:00:00Z"),
      }),
      id: () => id("11111111-1111-4111-8111-111111111111"),
    });
    withLedger(<Today />, controller);

    const rendered = document.body.textContent ?? "";
    expect(rendered).toContain("Dinner");
    expect(rendered).not.toContain(CLEARING_ACCOUNT.name);

    fireEvent.click(screen.getByText("Open"));
    expect(router.push).toHaveBeenCalledWith({
      pathname: "/transaction/[id]",
      params: { id: oldestId },
    });
  });

  /**
   * S04 §3 draws exactly one banner row and `Banner`'s own doc says
   * "page-level, one tone, one action" — a second unsettled account does not
   * stack a second alert. It folds into the same banner's text instead, and
   * `Open` still lands on the first (the same one the message names).
   */
  it("names the count in one banner, never a second, when two clearing accounts are unsettled", () => {
    withLedger(<Today />, fakeController([PLN_ACCOUNT, CLEARING_ACCOUNT, SECOND_CLEARING_ACCOUNT]));

    expect(screen.getAllByRole("alert")).toHaveLength(1);
    const rendered = document.body.textContent ?? "";
    expect(rendered).toContain("Shared clearing");
    expect(rendered).toContain("and 1 more");

    fireEvent.click(screen.getByText("Open"));
    expect(router.push).toHaveBeenCalledWith({
      pathname: "/transaction/[id]",
      params: { id: id<"transactions">(`unsettled-${CLEARING_ACCOUNT.id}`) },
    });
  });

  it("shows no unsettled banner once every clearing account nets to zero", () => {
    withLedger(
      <Today />,
      fakeController([PLN_ACCOUNT, { ...CLEARING_ACCOUNT, balance: toMoney("0") }]),
    );

    expect(screen.queryByRole("alert")).toBeNull();
  });

  it("shows all transactions from the Recent card", () => {
    withLedger(<Today />, fakeController([PLN_ACCOUNT]));

    fireEvent.click(screen.getByText("Show all →"));
    expect(router.push).toHaveBeenCalledWith("/ledger");
  });

  /**
   * A refresh that fails after a successful launch — S04 §6. The hero keeps
   * its last known figure (`mine` still renders) while the ground panel shows
   * `ErrorState(recoverable)`.
   */
  it("shows a recoverable error and keeps the hero when a refresh fails", () => {
    let calls = 0;
    const port: PhoneLedgerPort = {
      listAccounts: () => {
        calls += 1;
        if (calls > 1) throw new Error("query failed");
        return [PLN_ACCOUNT];
      },
      listCurrencies: () => [
        {
          code: currencyCode("PLN"),
          name: "Polish Złoty",
          symbol: "zł",
          decimals: 2,
          capturable: true,
          isPivot: true,
        },
      ],
      listGroups: () => [],
      listRecent: () => [],
      listCategories: () => [],
      listCounterparties: () => [],
      listPayeeHistory: () => [],
      listCategoryTree: () => [],
      listFullCategoryTree: () => [],
      listCategoryUsage: () => new Map(),
      readCategoryReferenceCounts: () => ({ transactions: 0, lines: 0, rules: 0 }),
      listNetWorth: () => netWorthOf([PLN_ACCOUNT]),
      readPeriodSpend: () => [],
      listUnsettledClearing: () => [],
      listCounterpartyBalances: () => [],
      listCounterpartyMerges: () => [],
      listDistinctCounterpartyPairs: () => [],
      balanceAsOf: () => toMoney("0"),
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
      readCrossRate: vi.fn(() => null),
      listCurrencySettings: () => [],
      readCoverage: vi.fn(() => []),
      listFxRates: vi.fn(() => []),
      addCurrency: vi.fn(),
      archiveCurrency: vi.fn(),
      setRateSource: vi.fn(),
      setPinned: vi.fn(),
      changePivot: vi.fn(),
      setManualRate: vi.fn(() => ({ written: 0, replacedManual: 0 })),
      clearManualRate: vi.fn(() => ({ deleted: 0 })),
      updateCurrency: vi.fn(),
      createCounterparty: vi.fn(),
      updateCounterparty: vi.fn(),
      mergeCounterparties: vi.fn(),
      unmergeCounterparties: vi.fn(),
      recordDistinctCounterparties: vi.fn(),
      settleDebt: vi.fn(() => ({ residual: toMoney("0"), overSettled: false })),
      renameCategory: vi.fn(),
      reparentCategory: vi.fn(),
      convertLeafGroup: vi.fn(),
      mergeCategories: vi.fn(),
      archiveCategory: vi.fn(),
      reset: vi.fn(),
    };
    const controller = createPhoneLedger(port, {
      capture: () => ({
        date: accountingDate("2026-09-03"),
        timeZone: "Europe/Warsaw",
        offsetMinutes: 120,
        at: new Date("2026-09-03T10:00:00Z"),
      }),
      id: () => id("11111111-1111-4111-8111-111111111111"),
    });
    try {
      controller.refresh();
    } catch {
      // Expected — asserting the snapshot it leaves behind, not this throw.
    }

    withLedger(<Today />, controller);

    expect(screen.getByText("Couldn't refresh")).toBeDefined();
    expect(screen.getByText("mine")).toBeDefined();
  });

  /**
   * Two deletes from S09, 3 s apart, both landing on the mounted Today —
   * `transaction-detail-screen.tsx`'s `dismissTo` carries the same message
   * text each time, distinguished only by `nonce`. Before the fix, a
   * constant `token` left the first toast's 4 s window running underneath —
   * the second confirmation would vanish 1 s later instead of living its
   * own full window.
   */
  it("re-arms the toast's window when a second delete arrives with the same message", () => {
    vi.useFakeTimers();
    try {
      useLocalSearchParams.mockReturnValue({ message: "Transaction deleted.", nonce: "1" });
      const { rerender } = withLedger(<Today />, fakeController([PLN_ACCOUNT]));
      expect(screen.getByRole("alert").textContent).toContain("Transaction deleted.");

      act(() => {
        vi.advanceTimersByTime(3_000);
      });
      useLocalSearchParams.mockReturnValue({ message: "Transaction deleted.", nonce: "2" });
      rerender(
        <LedgerProvider controller={fakeController([PLN_ACCOUNT])}>
          <Today />
        </LedgerProvider>,
      );
      expect(screen.getByRole("alert").textContent).toContain("Transaction deleted.");

      // The un-rearmed bug: the first window would expire 1 s from here.
      act(() => {
        vi.advanceTimersByTime(1_000);
      });
      expect(screen.getByRole("alert")).toBeDefined();

      // The re-armed window lives its own full 4 s from the second arrival.
      act(() => {
        vi.advanceTimersByTime(3_000);
      });
      expect(screen.queryByRole("alert")).toBeNull();
    } finally {
      vi.useRealTimers();
    }
  });
});

describe("QuickAdd", () => {
  // jsdom's default width is below `breakpoint.desk` (`use-breakpoint.test.tsx`
  // measures it), so an unresized render already exercises D4b's phone path —
  // `QuickAddComposer` above a `Dock`. `quick-add-screen.test.tsx` covers that
  // path in full (keypad, chip picks, Save); this file keeps the one smoke
  // test plus the desk fallback (`QuickAddForm`, unchanged by D4b) below.
  it("offers the ledger's accounts to capture against, via the account sheet", () => {
    withLedger(<QuickAdd />, fakeController([PLN_ACCOUNT]));

    fireEvent.click(screen.getByRole("button", { name: "Account" }));
    expect(screen.getByText("Bank A · PLN")).toBeDefined();
  });

  it("offers the ledger's accounts via AccountPicker at the desk breakpoint (QuickAddForm's own fallback)", () => {
    // `use-breakpoint.test.tsx`'s own pattern: `Dimensions.get`'s initial
    // read only re-measures on the process's first call, so a width set
    // after some earlier render needs a real `resize` event, not just the
    // property write, to reach this one.
    Object.defineProperty(document.documentElement, "clientWidth", {
      value: 1024,
      configurable: true,
    });
    act(() => window.dispatchEvent(new Event("resize")));
    withLedger(<QuickAdd />, fakeController([PLN_ACCOUNT]));

    fireEvent.click(screen.getByRole("button", { name: "Account" }));
    expect(screen.getByText("Bank A · PLN")).toBeDefined();
  });
});

describe("NewAccount", () => {
  it("renders the create form over the ledger's currencies", () => {
    useLocalSearchParams.mockReturnValue({ returnTo: "today" });
    withLedger(<NewAccount />);

    expect(screen.getByText(/PLN/)).toBeDefined();
    expect(screen.getByRole("button", { name: "Save" })).toBeDefined();
  });
});

/**
 * The remaining tab stub — S11 until its own arc builds the real screen. It
 * names itself and offers the one honest way out: Today. `Ledger` graduated
 * out of this list at C4 (S10, `ledger-screen.test.tsx`); `Debt` graduated at
 * E4 (S12, `debt-screen.test.tsx`).
 */
describe("tab stubs", () => {
  it.each([["Calendar", CalendarStub]])("%s names itself and returns to Today", (title, Stub) => {
    render(<Stub />);
    expect(screen.getByText(title)).toBeDefined();
    fireEvent.click(screen.getByRole("button", { name: "Go to Today" }));
    expect(router.push).toHaveBeenCalledWith("/");
  });
});

describe("Settings", () => {
  it("opens the categories editor", () => {
    withLedger(<SettingsScreen />);

    fireEvent.click(screen.getByRole("button", { name: "Categories" }));
    expect(router.push).toHaveBeenCalledWith("/settings/categories");
  });
});

describe("CategoriesScreen", () => {
  const FOOD_GROUP = "22222222-2222-4222-8222-222222222222";
  const GROCERIES = "33333333-3333-4333-8333-333333333333";
  const EATING_OUT = "44444444-4444-4444-8444-444444444444";
  const UNCATEGORIZED = "99999999-9999-4999-8999-999999999999";

  const tree = [
    fakeCategory({ id: FOOD_GROUP, name: "Food", kind: "expense", isLeaf: false }),
    fakeCategory({ id: GROCERIES, name: "Groceries", parentId: FOOD_GROUP, kind: "expense" }),
    fakeCategory({ id: EATING_OUT, name: "Eating out", parentId: FOOD_GROUP, kind: "expense" }),
    fakeCategory({ id: UNCATEGORIZED, name: "Uncategorized", kind: "expense" }),
  ];
  const usage = new Map([
    [id<"categories">(GROCERIES), 214],
    [id<"categories">(UNCATEGORIZED), 12],
  ]);

  it("shows the tree, an unused leaf tagged, and Uncategorized apart with its count", () => {
    withLedger(<CategoriesScreen />, fakeController([], [], tree, usage));

    expect(screen.getByText("Food")).toBeDefined();
    expect(screen.getByText("214 transactions")).toBeDefined();
    expect(screen.getByText("Unused")).toBeDefined(); // Eating out, zero usage
    expect(screen.getByText("Uncategorized")).toBeDefined();
    expect(screen.getByText("12 transactions")).toBeDefined();
    // Uncategorized is shown apart — not a second time inside the tree body.
    expect(screen.getAllByText("Uncategorized")).toHaveLength(1);
  });

  it("filters the tree by search, keeping a matched leaf's group visible", () => {
    withLedger(<CategoriesScreen />, fakeController([], [], tree, usage));

    fireEvent.change(screen.getByPlaceholderText("Search…"), { target: { value: "eating" } });

    expect(screen.getByText("Food")).toBeDefined();
    expect(screen.getByText("Eating out")).toBeDefined();
    expect(screen.queryByText("Groceries")).toBeNull();
  });

  it("hides an archived leaf until the toggle is on", () => {
    const archivedTree = [
      ...tree,
      fakeCategory({
        id: "77777777-7777-4777-8777-777777777777",
        name: "Old subscriptions",
        parentId: FOOD_GROUP,
        kind: "expense",
        archived: true,
      }),
    ];
    withLedger(<CategoriesScreen />, fakeController([], [], archivedTree, usage));

    expect(screen.queryByText("Old subscriptions")).toBeNull();
    fireEvent.click(screen.getByRole("switch", { name: "Show archived" }));
    expect(screen.getByText("Old subscriptions")).toBeDefined();
  });

  it("renames a category end to end, through the actions sheet", () => {
    withLedger(<CategoriesScreen />, fakeController([], [], tree, usage));

    fireEvent.click(screen.getByRole("button", { name: "Groceries actions" }));
    fireEvent.click(screen.getByRole("button", { name: "Rename" }));
    fireEvent.change(screen.getByLabelText("Name"), {
      target: { value: "Groceries & household" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Save" }));

    expect(screen.getByText("Groceries & household")).toBeDefined();
  });

  it("names the direction it just converted — group vs leaf are different Toasts", () => {
    withLedger(<CategoriesScreen />, fakeController([], [], tree, usage));

    fireEvent.click(screen.getByRole("button", { name: "Eating out actions" }));
    fireEvent.click(screen.getByRole("button", { name: "Convert to group" }));
    expect(screen.getByText("Convert to group")).toBeDefined(); // the Toast, not the button

    fireEvent.click(screen.getByRole("button", { name: "Eating out actions" }));
    fireEvent.click(screen.getByRole("button", { name: "Convert to leaf" }));
    expect(screen.getByText("Convert to leaf")).toBeDefined();
  });

  it("shows the sibling-collision refusal inline, without closing the sheet", () => {
    withLedger(<CategoriesScreen />, fakeController([], [], tree, usage));

    fireEvent.click(screen.getByRole("button", { name: "Eating out actions" }));
    fireEvent.click(screen.getByRole("button", { name: "Rename" }));
    fireEvent.change(screen.getByLabelText("Name"), { target: { value: "groceries" } });
    fireEvent.click(screen.getByRole("button", { name: "Save" }));

    expect(screen.getByText('"Groceries" already exists here')).toBeDefined();
  });

  it("archives a category — it drops off the default list, no Undo offered", () => {
    withLedger(<CategoriesScreen />, fakeController([], [], tree, usage));

    fireEvent.click(screen.getByRole("button", { name: "Eating out actions" }));
    fireEvent.click(screen.getByRole("button", { name: "Archive" }));

    expect(screen.queryByText("Eating out")).toBeNull();
    // No `restore_category` operation exists — a plain Toast, never `UndoToast`.
    expect(screen.queryByRole("button", { name: "Undo" })).toBeNull();

    fireEvent.click(screen.getByRole("switch", { name: "Show archived" }));
    expect(screen.getByText("Eating out")).toBeDefined();
    expect(screen.getByText("Archived")).toBeDefined();
  });

  it("opens the merge sheet pre-seeded from a collision, and confirms the merge", () => {
    const collisionTree = [
      fakeCategory({
        id: "aaaaaaaa-0000-4000-8000-000000000001",
        name: "Groceries",
        kind: "expense",
      }),
      fakeCategory({
        id: "aaaaaaaa-0000-4000-8000-000000000002",
        name: "Grocery",
        kind: "expense",
      }),
    ];
    const collisionUsage = new Map([
      [id<"categories">("aaaaaaaa-0000-4000-8000-000000000001"), 214],
      [id<"categories">("aaaaaaaa-0000-4000-8000-000000000002"), 3],
    ]);
    withLedger(<CategoriesScreen />, fakeController([], [], collisionTree, collisionUsage));

    expect(screen.getByText("Possibly the same category")).toBeDefined();
    fireEvent.click(screen.getByRole("button", { name: "Review" }));

    // The lower-usage side ("Grocery") is the proposed loser.
    expect(screen.getByText("Grocery → Groceries")).toBeDefined();
    fireEvent.click(screen.getAllByRole("button", { name: "Merge" })[0] as HTMLElement);
    fireEvent.click(screen.getAllByRole("button", { name: "Merge" }).slice(-1)[0] as HTMLElement);

    expect(screen.queryByText("This can't be undone in one step")).toBeNull();
  });

  // M2 — matching by name and `isLeaf` alone, with no `kind` check, swept a
  // same-named-and-shaped sibling into the seeded leaf's own "apart, not in
  // the tree" treatment. Sibling uniqueness is `(parent, kind, name)`, so
  // the *reachable* legal duplicate is one that differs only in `kind` — an
  // "Uncategorized" income leaf at the root, alongside the seeded expense
  // one. (A same-`kind` root also named "Uncategorized" — leaf or group —
  // would collide with the seeded row on that same constraint and could
  // never reach the replica in the first place.)
  it("keeps a same-named root leaf of a different kind visible in the tree, apart from the seeded one", () => {
    const incomeLeaf = "88888888-8888-4888-8888-888888888888";
    const treeWithDuplicate = [
      ...tree,
      fakeCategory({ id: incomeLeaf, name: "Uncategorized", kind: "income", isLeaf: true }),
    ];
    withLedger(<CategoriesScreen />, fakeController([], [], treeWithDuplicate, usage));

    // The seeded expense leaf still shows apart, and the income leaf still
    // shows in the tree body — two rows, not one collapsed into the other.
    expect(screen.getAllByText("Uncategorized")).toHaveLength(2);
    expect(screen.getByRole("button", { name: "Uncategorized actions" })).toBeDefined();
  });
});
