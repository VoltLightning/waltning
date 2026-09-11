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

import { act, cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import {
  createPhoneLedger,
  type PhoneClearingAccount,
  type PhoneCurrency,
  type PhoneNetWorth,
  type PhoneRecentTransaction,
  type PhoneSearchTransaction,
  type PhoneSpendByCategory,
} from "@waltning/client/ledger/create-phone-ledger";
import { deviceRuntime } from "@waltning/client/ledger/device-runtime";
import { LedgerProvider } from "@waltning/client/ledger/ledger-provider";
import { basePort } from "@waltning/client/ledger/test-port";
import { accountingDate, type YearMonth, yearMonth } from "@waltning/core/date";
import { type Id, id } from "@waltning/core/id";
import * as money from "@waltning/core/money";
import {
  type BalanceRow,
  type CurrencyCode,
  currencyCode,
  type LedgerScope,
  type Money,
  netWorth,
  type PeriodSpendRow,
  toMoney,
  unsettledClearing,
} from "@waltning/core/money";
import { I18nProvider } from "@waltning/ui/i18n/provider";
import type { ReactElement } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const router = { push: vi.fn(), back: vi.fn(), dismissTo: vi.fn(), setParams: vi.fn() };
const useLocalSearchParams = vi.fn(() => ({}));

vi.mock("expo-router", () => ({
  get router() {
    return router;
  },
  useLocalSearchParams: () => useLocalSearchParams(),
}));

import NewAccount from "./account-creation-screen";
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

/** The one category these two S04 tests name. */
const GROCERIES = "00000000-0000-4000-8000-00000000c001";

/** A §6 bucket, as `readSpendByCategory` returns them — `null` is the blank. */
function spendBucket(categoryId: string | null, amount: string): PhoneSpendByCategory {
  return {
    currency: currencyCode("PLN"),
    decimals: 2,
    categoryId,
    amount: toMoney(amount),
  } as PhoneSpendByCategory;
}

/**
 * **Named, not positional.** Six positional parameters had already made
 * a `fakeController([], [], tree, usage)` call a row of placeholders whose
 * meaning lived in the signature rather than at the call site, and the
 * seventh — the unfiltered transaction count S04's empty state now reads —
 * would have made it seven. Every field is optional, and every default is the
 * honest empty ledger.
 */
type FakeControllerOptions = {
  accounts?: readonly FakeAccount[];
  periodSpend?: readonly PeriodSpendRow[];
  /**
   * §6's buckets, as `readSpendByCategory` would return them for the scope it
   * is asked for. A function rather than rows, so a test can assert **which
   * scope the screen asked for** — the defect this fixture exists to pin was
   * S04 asking for `"all"` while the figure above the chart came from a read
   * that keeps own accounts only.
   */
  spendByCategory?: (scope: LedgerScope) => readonly PhoneSpendByCategory[];
  categories?: readonly FakeCategory[];
  categoryUsage?: ReadonlyMap<Id<"categories">, number>;
  /** H2 — a caller testing the opening-balance banner hands its own rows rather than `unsettledOf`'s generic ones. */
  unsettled?: readonly PhoneClearingAccount[];
  /**
   * The rows S04's List page walks, and the day panel its Calendar opens.
   *
   * **One list, three reads.** `readLedgerPage` pages it, `readDayRows` cuts
   * one day out of it and `readDayFlows` folds it by day — exactly as the
   * replica's three reads do over one table. A fixture that let them disagree
   * could not catch a screen that says two different things about one month,
   * which is the defect those reads are shaped to prevent.
   */
  ledger?: readonly PhoneSearchTransaction[];
  /** S04's Recent rows. Empty by default: most callers here are not about Recent, and an empty ledger is the honest default for a fixture that captures nothing. */
  recent?: readonly PhoneRecentTransaction[];
  /**
   * What an unfiltered `searchTransactions({})` counts — the whole ledger,
   * which S04 reads to tell *nothing was ever captured* from *the Recent
   * window came back empty*. Zero by default, which is the same ledger
   * `recent: []` describes.
   */
  transactionCount?: number;
  /**
   * What the replica holds. One capturable pivot by default — the ordinary
   * ledger; a caller testing §14.6's gate hands a currency with no rate.
   */
  currencies?: readonly PhoneCurrency[];
};

/** Newest first — a page walked `older` is descending by date. */
function byDateDesc(a: PhoneSearchTransaction, b: PhoneSearchTransaction): number {
  return a.date < b.date ? 1 : a.date > b.date ? -1 : 0;
}

/**
 * The same fold `money.dayFlows` performs, over the fixture's own rows.
 *
 * Written out rather than imported so the fixture states what it means by a
 * day: an amount stored signed on the row (§12's display convention, which is
 * what `signRow` produces) split back into the magnitudes §5 sums.
 */
function dayFlowsOf(
  rows: readonly PhoneSearchTransaction[],
  period: money.Period,
): readonly money.DayFlowRow[] {
  const byDay = new Map<string, { spend: Money; inflow: Money }>();
  for (const row of rows) {
    if (row.date < period.start || row.date >= period.end) continue;
    const bucket = byDay.get(row.date) ?? { spend: money.ZERO, inflow: money.ZERO };
    byDay.set(
      row.date,
      money.cmp(row.amount, money.ZERO) < 0
        ? { ...bucket, spend: money.add(bucket.spend, money.abs(row.amount)) }
        : { ...bucket, inflow: money.add(bucket.inflow, row.amount) },
    );
  }
  return [...byDay.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([date, flow]) => ({
      date: accountingDate(date),
      currency: currencyCode("PLN"),
      decimals: 2,
      spend: flow.spend,
      inflow: flow.inflow,
    }));
}

/**
 * The nearest day outside the period, off the **same rows** the grid draws —
 * the fourth read over the one list, for the reason the third is: a fixture
 * that let them disagree could not catch a screen offering *go to September*
 * over a September the calendar draws nothing in.
 */
function nearestActivityOf(
  rows: readonly PhoneSearchTransaction[],
  period: money.Period,
): { date: ReturnType<typeof accountingDate>; month: YearMonth; count: number } | null {
  // **Folded, not listed.** Taking the raw rows let the fixture offer a month
  // the grid draws nothing in — the exact disagreement `dayFlowsOf` exists to
  // make impossible — so the dates come from the same fold, over the whole
  // ledger rather than one period.
  const everything = { start: accountingDate("0001-01-01"), end: accountingDate("9999-12-31") };
  const dates = dayFlowsOf(rows, everything).map((flow) => flow.date);
  const before = dates.filter((date) => date < period.start).at(-1);
  const after = dates.find((date) => date >= period.end);
  const days = (date: string) => {
    const [y, m, d] = date.split("-").map(Number) as [number, number, number];
    return Math.floor(Date.UTC(y, m - 1, d) / 86_400_000);
  };
  const nearest =
    before === undefined
      ? after
      : after === undefined
        ? before
        : days(after) - days(period.end) + 1 < days(period.start) - days(before)
          ? after
          : before;
  if (nearest === undefined) return null;
  const month = yearMonth(nearest.slice(0, 7));
  return {
    date: accountingDate(nearest),
    month,
    // Days, not rows — `dayFlowsOf` folds a day into one figure, which is what
    // the grid draws; a fixture counting rows would drift from the real read.
    count: rows.filter((row) => row.date.startsWith(month)).length,
  };
}

function fakeController(options: FakeControllerOptions = {}) {
  const {
    accounts: initialAccounts = [],
    periodSpend: periodSpendRows = [],
    categories: initialCategories = [],
    categoryUsage = new Map<Id<"categories">, number>(),
    spendByCategory = () => [],
    unsettled: unsettledOverride,
    ledger: ledgerRows = [],
    recent: recentRows = [],
    transactionCount = 0,
    currencies = [
      {
        code: currencyCode("PLN"),
        name: "Polish Złoty",
        symbol: "zł",
        decimals: 2,
        capturable: true,
        isPivot: true,
      },
    ],
  } = options;
  let accounts = [...initialAccounts];
  let categoryTree: FakeCategory[] = [...initialCategories];
  const bumpCategory = (categoryId: Id<"categories">, patch: Partial<FakeCategory>) => {
    categoryTree = categoryTree.map((node) =>
      node.id === categoryId ? { ...node, ...patch, version: node.version + 1 } : node,
    );
  };
  const port = basePort({
    listAccounts: () => accounts,
    listCurrencies: () => currencies,
    listRecent: () => recentRows,
    listFullCategoryTree: () => categoryTree,
    // The picker's own read — archived-excluded, version-free — and the one
    // `createCategory` folds its sibling-collision check over.
    listCategoryTree: () =>
      categoryTree
        .filter((node) => !node.archived)
        .map(({ id: nodeId, parentId, name, kind, isLeaf, sort, depth, externalId }) => ({
          id: nodeId,
          parentId,
          name,
          kind,
          isLeaf,
          sort,
          depth,
          externalId,
        })),
    listCategoryUsage: () => categoryUsage,
    listNetWorth: () => netWorthOf(accounts),
    readPeriodSpend: () => periodSpendRows,
    // Newest first, the way `readLedgerPage` returns a page walked older.
    readLedgerPage: ({ direction }) => ({
      rows: direction === "older" ? [...ledgerRows].sort(byDateDesc) : [],
      nextCursor: undefined,
    }),
    readDayRows: (date) => ledgerRows.filter((row) => row.date === date),
    readDayFlows: (period) => dayFlowsOf(ledgerRows, period),
    readNearestActivity: (period) => nearestActivityOf(ledgerRows, period),
    /**
     * §7's counts, folded from the same rows — the fifth read over the one
     * list. Answering `[]` to every query made the calendar's *no matches*
     * state true of every search, so a test could not tell a query with no
     * answer from one the fixture simply could not run.
     */
    readMatchDays: (period, text) => {
      const needle = text.trim().toLowerCase();
      const byDay = new Map<string, number>();
      for (const row of ledgerRows) {
        if (row.date < period.start || row.date >= period.end) continue;
        if (!row.payee.toLowerCase().includes(needle)) continue;
        byDay.set(row.date, (byDay.get(row.date) ?? 0) + 1);
      }
      return [...byDay.entries()]
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([date, count]) => ({ date: accountingDate(date), count }));
    },
    readSpendByCategory: (_period, scope) => spendByCategory(scope),
    listUnsettledClearing: () => unsettledOverride ?? unsettledOf(accounts),
    // No screen under test here drives S10 yet (`ledger-screen.test.tsx`
    // does) — an empty page and a no-op are enough to satisfy the port. The
    // count is the one figure S04 does read from it.
    searchTransactions: () => ({
      rows: [],
      nextCursor: undefined,
      total: { count: transactionCount, currencies: [] },
    }),
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
    createCategory: (input) => {
      // **Prepended, not appended.** `insertCategory` never sets `sort`, so a
      // freshly created row can come back *before* the seeded taxonomy —
      // which is exactly what broke code identifying `Uncategorized` as
      // "the first root leaf". The fixture reproduces the hostile order so
      // the screens are tested against it rather than against a convenience.
      categoryTree = [
        {
          id: input.id,
          parentId: input.parentId,
          name: input.name,
          kind: input.kind,
          isLeaf: true,
          archived: false,
          sort: 0,
          depth: input.parentId === null ? 0 : 1,
          version: 1,
          externalId: null,
        },
        ...categoryTree,
      ];
    },
    renameCategory: (input) => bumpCategory(input.id, { name: input.name }),
    reparentCategory: (input) => bumpCategory(input.id, { parentId: input.parentId }),
    convertLeafGroup: (input) => bumpCategory(input.id, { isLeaf: input.to === "leaf" }),
    mergeCategories: (input) => bumpCategory(input.loserId, { archived: true }),
    archiveCategory: (input) => bumpCategory(input.id, { archived: true }),
    reset: () => {
      accounts = [];
    },
  });
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

/** One captured row — all S04's Recent card needs to be a group of rows. */
const RECENT_ROW: PhoneRecentTransaction = {
  id: id<"transactions">("77777777-7777-4777-8777-777777777777"),
  date: accountingDate("2026-09-03"),
  payee: "Shop A",
  categoryName: "Food",
  accountName: PLN_ACCOUNT.name,
  amount: toMoney("-48.90"),
  currency: currencyCode("PLN"),
  decimals: 2,
  isBusiness: false,
  // §14.4b — nothing recognised for this payee; `BrandIcon` draws its monogram.
  brandKey: null,
};

function withLedger(element: ReactElement, controller = fakeController()) {
  return render(<LedgerProvider controller={controller}>{element}</LedgerProvider>);
}

beforeEach(() => {
  router.push.mockClear();
  router.back.mockClear();
  router.dismissTo.mockClear();
  router.setParams.mockClear();
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
    withLedger(<Today />, fakeController({ accounts: [PLN_ACCOUNT], recent: [RECENT_ROW] }));

    expect(screen.queryByText("No accounts yet")).toBeNull();
    expect(screen.getByText("Kept so far")).toBeDefined();
  });

  /**
   * M-b — S04 §3: the card *is* the group of Recent rows, so an account with
   * nothing captured yet gets S10's own first-run wording on the ground, not a
   * *Recent* card with *Show all* over an empty column.
   */
  it("draws no Recent card when an account exists but nothing has been captured", () => {
    withLedger(<Today />, fakeController({ accounts: [PLN_ACCOUNT] }));

    // **Scoped to the page on screen.** All four of the pager's pages are
    // mounted at once and List carries the same empty state, so an unscoped
    // text query finds two of everything. `getByRole` skips the pages hidden
    // from the accessibility tree, which is the same set a reader cannot see.
    const summary = within(screen.getByRole("tabpanel"));
    expect(screen.queryByText("No accounts yet")).toBeNull();
    expect(summary.queryByText("Recent")).toBeNull();
    expect(summary.queryByText("Show all →")).toBeNull();
    expect(summary.getByText("No transactions yet")).toBeDefined();

    fireEvent.click(summary.getByText("Add"));
    expect(router.push).toHaveBeenCalledWith("/quick-add");
  });

  /**
   * S04 §3 — *which* empty it is, is a count over the whole ledger, never the
   * emptiness of the page read older from today. A ledger whose rows are all
   * dated ahead (§6's forward horizon) folds to no last days, and it has not
   * had a first run: today is drawn as the List draws the same day — its own
   * quiet line — with no first-run wording and no door to anywhere.
   *
   * **Broken once**: with the count asked on `snapshot.recent.length` while
   * the branch tested `recentDays.length` — the shape this replaces — the
   * ledger below read *No transactions yet* and offered *Add*, telling someone
   * with a ledger of expected entries to start one.
   */
  it("draws today as a quiet line, not a first run, when the rows are all ahead of it", () => {
    withLedger(
      <Today />,
      fakeController({ accounts: [PLN_ACCOUNT], recent: [], transactionCount: 12 }),
    );

    const summary = within(screen.getByRole("tabpanel"));
    expect(summary.queryByText("No transactions yet")).toBeNull();
    expect(summary.queryByText("No matching transactions")).toBeNull();
    expect(summary.queryByText("Add")).toBeNull();
    expect(summary.getByText("nothing")).toBeDefined();
  });

  it("shows mine and ours from net worth, per currency — never a summed total", () => {
    withLedger(<Today />, fakeController({ accounts: [PLN_ACCOUNT, SHARED_ACCOUNT] }));

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
    withLedger(<Today />, fakeController({ accounts: [PLN_ACCOUNT] }));

    expect(screen.getByText("mine")).toBeDefined();
    expect(screen.queryByText("ours")).toBeNull();
  });

  /**
   * §12: `spent` is §5's positive `spend` magnitude, not a signed delta — a
   * 120.50 expense renders as `120.50`, never `-120.50`.
   *
   * **The three figures are §5's whole identity, `net = inflow − spend`.**
   * `inflow` used to be computed inside `periodSpend` and thrown away, so the
   * screen showed *spent* and *net* and left the reader to work out what came
   * in. Stating all three is what makes the month card readable as one
   * sentence rather than two numbers and a subtraction.
   */
  it("shows the month card's three figures from periodSpend, spend as a positive magnitude", () => {
    const rows: readonly PeriodSpendRow[] = [
      {
        currency: currencyCode("PLN"),
        decimals: 2,
        spend: toMoney("120.50"),
        inflow: toMoney("160.50"),
        net: toMoney("40.00"),
      },
    ];
    withLedger(<Today />, fakeController({ accounts: [PLN_ACCOUNT], periodSpend: rows }));

    expect(screen.getByText("Kept so far")).toBeDefined();
    expect(screen.getByText("Came in")).toBeDefined();
    expect(screen.getByText("Went out")).toBeDefined();
    const rendered = document.body.textContent ?? "";
    expect(rendered).toContain("120.50");
    expect(rendered).not.toContain("-120.50");
    expect(rendered).toContain("160.50");
    expect(rendered).toContain("40.00");
  });

  /**
   * **The chart breaks down the figure directly above it, so it reads the same
   * rows.** `readSpendByCategory("all")` keeps shared-account rows;
   * `periodSpend` — which produces *went out* — keeps `ownership === "own"`
   * only, so the bars summed higher than the total they claim to explain. The
   * fixture answers per scope, so this asserts *which scope was asked for*
   * rather than trusting the number that came back.
   */
  it("asks for the same scope the month card's figures came from", () => {
    const byScope = new Map<LedgerScope, readonly PhoneSpendByCategory[]>([
      ["mine", [spendBucket(GROCERIES, "120.50")]],
      ["all", [spendBucket(GROCERIES, "120.50"), spendBucket(null, "400.00")]],
    ]);
    withLedger(
      <Today />,
      fakeController({
        accounts: [PLN_ACCOUNT],
        categories: [fakeCategory({ id: GROCERIES, name: "Groceries", kind: "expense" })],
        periodSpend: [
          {
            currency: currencyCode("PLN"),
            decimals: 2,
            spend: toMoney("120.50"),
            inflow: toMoney("160.50"),
            net: toMoney("40.00"),
          },
        ],
        spendByCategory: (scope) => byScope.get(scope) ?? [],
      }),
    );

    expect(screen.getByText("Where it went")).toBeDefined();
    expect(screen.getByText("Groceries")).toBeDefined();
    // The shared row `"all"` would have added is absent, so the bars sum to
    // the same 120.50 the tile above them shows.
    expect(screen.queryByText("Uncategorized")).toBeNull();
  });

  /**
   * Archiving a category does not rewrite the transactions filed under it, and
   * the picker's tree drops archived rows — so resolving names from that tree
   * relabelled last month's spending as the honest blank. The screen reads the
   * archived-inclusive tree instead.
   */
  it("still names a category that has since been archived", () => {
    withLedger(
      <Today />,
      fakeController({
        accounts: [PLN_ACCOUNT],
        categories: [
          fakeCategory({ id: GROCERIES, name: "Groceries", kind: "expense", archived: true }),
        ],
        periodSpend: [
          {
            currency: currencyCode("PLN"),
            decimals: 2,
            spend: toMoney("120.50"),
            inflow: toMoney("0"),
            net: toMoney("-120.50"),
          },
        ],
        spendByCategory: () => [spendBucket(GROCERIES, "120.50")],
      }),
    );

    expect(screen.getByText("Groceries")).toBeDefined();
    expect(screen.queryByText("Uncategorized")).toBeNull();
  });

  it("shows the unsettled banner and opens the named transaction", () => {
    withLedger(<Today />, fakeController({ accounts: [PLN_ACCOUNT, CLEARING_ACCOUNT] }));

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
    const controller = fakeController({
      accounts: [PLN_ACCOUNT, CLEARING_ACCOUNT],
      unsettled: [
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
      ],
    });
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
    const port = basePort({
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
      listNetWorth: () => netWorthOf([PLN_ACCOUNT]),
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
    });
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
   * H1 — a negative clearing balance keeps its sign in the remainder, so a
   * remainder equal to the balance (both `-150`) reads as the same figure
   * through `money.eq`: the banner names the single unsettled leg without
   * the "differs" parenthetical, and the figure it shows is signed.
   */
  it("shows a negative remainder signed, and does not claim it differs from an equal balance", () => {
    const controller = fakeController({
      accounts: [PLN_ACCOUNT, CLEARING_ACCOUNT],
      unsettled: [
        {
          accountId: CLEARING_ACCOUNT.id,
          name: CLEARING_ACCOUNT.name,
          currency: CLEARING_ACCOUNT.currency,
          decimals: CLEARING_ACCOUNT.decimals,
          balance: toMoney("-150"),
          oldestUnconsumedTransactionId: id<"transactions">("77777777-7777-4777-8777-777777777777"),
          oldestDate: accountingDate("2026-08-01"),
          oldestUnconsumedRemainder: toMoney("-150"),
          oldestUnconsumedPayee: "Hotel",
        },
      ],
    });
    withLedger(<Today />, controller);

    const rendered = document.body.textContent ?? "";
    expect(rendered).toContain("-150.00 PLN unallocated · Hotel");
    expect(rendered).not.toContain("account balance");
  });

  /**
   * S04 §3 draws exactly one banner row and `Banner`'s own doc says
   * "page-level, one tone, one action" — a second unsettled account does not
   * stack a second alert. It folds into the same banner's text instead, and
   * `Open` still lands on the first (the same one the message names).
   */
  it("names the count in one banner, never a second, when two clearing accounts are unsettled", () => {
    withLedger(
      <Today />,
      fakeController({ accounts: [PLN_ACCOUNT, CLEARING_ACCOUNT, SECOND_CLEARING_ACCOUNT] }),
    );

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
      fakeController({ accounts: [PLN_ACCOUNT, { ...CLEARING_ACCOUNT, balance: toMoney("0") }] }),
    );

    expect(screen.queryByRole("alert")).toBeNull();
  });

  /**
   * A refresh that fails after a successful launch — S04 §6. The hero keeps
   * its last known figure (`mine` still renders) while the ground panel shows
   * `ErrorState(recoverable)`.
   */
  it("shows a recoverable error and keeps the figures when a refresh fails", () => {
    let calls = 0;
    const port = basePort({
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
      listNetWorth: () => netWorthOf([PLN_ACCOUNT]),
    });
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
    // S04 §6: a failed balance query replaces the ground's body and nothing
    // else, so the figures it did not touch stay. Both of them — the strip and
    // the month card render above the error branch for exactly this reason,
    // which the band used to give for free when it held the hero.
    // The **figures**, not their labels. Asserting `getByText("mine")` passed
    // with the strip rendering zero, because "mine" is a kicker.
    expect(screen.getByText("Kept so far")).toBeDefined();
    const rendered = document.body.textContent ?? "";
    expect(rendered).toContain("50.00");
  });

  /**
   * Two deletes from S09, 3 s apart, both landing on the mounted Today —
   * `transaction-detail-screen.tsx`'s `dismissTo` carries the same message
   * text each time, distinguished only by `nonce`. Before the fix, a
   * constant `token` left the first toast's 4 s window running underneath —
   * the second confirmation would vanish 1 s later instead of living its
   * own full window.
   */
  it("re-arms the toast's window when a second delete arrives with the same message", async () => {
    vi.useFakeTimers();
    try {
      useLocalSearchParams.mockReturnValue({ message: "Transaction deleted.", nonce: "1" });
      const { rerender } = withLedger(<Today />, fakeController({ accounts: [PLN_ACCOUNT] }));
      expect(screen.getByRole("alert").textContent).toContain("Transaction deleted.");

      await act(async () => {
        await vi.advanceTimersByTimeAsync(3_000);
      });
      useLocalSearchParams.mockReturnValue({ message: "Transaction deleted.", nonce: "2" });
      rerender(
        <LedgerProvider controller={fakeController({ accounts: [PLN_ACCOUNT] })}>
          <Today />
        </LedgerProvider>,
      );
      expect(screen.getByRole("alert").textContent).toContain("Transaction deleted.");

      // The un-rearmed bug: the first window would expire 1 s from here.
      await act(async () => {
        await vi.advanceTimersByTimeAsync(1_000);
      });
      expect(screen.getByRole("alert")).toBeDefined();

      // The re-armed window lives its own full 4 s from the second arrival.
      await act(async () => {
        await vi.advanceTimersByTimeAsync(3_000);
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
    withLedger(<QuickAdd />, fakeController({ accounts: [PLN_ACCOUNT] }));

    fireEvent.click(screen.getByRole("button", { name: /^From/ }));
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
    withLedger(<QuickAdd />, fakeController({ accounts: [PLN_ACCOUNT] }));

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

  /**
   * §14.6 — the account still opens in a currency with no rate; what it
   * cannot do is carry transactions. The way out is S18, on that currency
   * and on the day the form is already dated by.
   */
  it("names a currency with no rate and opens S18 on it", () => {
    useLocalSearchParams.mockReturnValue({ returnTo: "today" });
    withLedger(
      <NewAccount />,
      fakeController({
        currencies: [
          {
            code: currencyCode("BYN"),
            name: "Belarusian Ruble",
            symbol: "Br",
            decimals: 2,
            capturable: false,
            isPivot: false,
          },
        ],
      }),
    );

    expect(screen.getByText(/BYN has no exchange rate yet/)).toBeDefined();
    fireEvent.click(screen.getByRole("button", { name: "Set a BYN rate" }));
    expect(router.push).toHaveBeenCalledWith({
      pathname: "/settings/rates",
      // The device's own calendar (§7.0a) — the same read the form's
      // "Opening date" shortcut row makes, not the fixture's frozen clock.
      params: { quote: "BYN", date: deviceRuntime().capture().date },
    });
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
    withLedger(<CategoriesScreen />, fakeController({ categories: tree, categoryUsage: usage }));

    expect(screen.getByText("Food")).toBeDefined();
    expect(screen.getByText("214 transactions")).toBeDefined();
    expect(screen.getByText("Unused")).toBeDefined(); // Eating out, zero usage
    expect(screen.getByText("Uncategorized")).toBeDefined();
    expect(screen.getByText("12 transactions")).toBeDefined();
    // Uncategorized is shown apart — not a second time inside the tree body.
    expect(screen.getAllByText("Uncategorized")).toHaveLength(1);
  });

  /**
   * §6 said *"Empty — n/a, the taxonomy is seeded"*, and a phone-alone ledger
   * seeds nothing: this was a search field and a toggle over a blank page.
   */
  it("offers an empty state and a way to create the first category", () => {
    withLedger(<CategoriesScreen />, fakeController());

    expect(screen.getByText("No categories yet")).toBeDefined();
    fireEvent.click(screen.getByRole("button", { name: "New category" }));
    fireEvent.change(screen.getByLabelText("Name"), { target: { value: "Food" } });
    fireEvent.click(screen.getByRole("button", { name: "Save" }));

    expect(screen.getByText("Food")).toBeDefined();
    expect(screen.queryByText("No categories yet")).toBeNull();
  });

  /**
   * **`Uncategorized` is matched by what it *is*, never by where it sits.**
   * A category created at top level is a root leaf too, and it can sort
   * ahead of the seeded row — so "the first root leaf" names whichever was
   * written last. The match here is the seed's own tag first
   * (`externalId === "seed:uncategorized"`), and failing that the whole
   * seeded shape *including the name*, which a new leaf cannot collide with:
   * `create_category` refuses a duplicate name under the same parent and
   * kind.
   */
  it("keeps Uncategorized apart when a new root leaf sorts ahead of it", () => {
    withLedger(<CategoriesScreen />, fakeController({ categories: tree, categoryUsage: usage }));

    fireEvent.click(screen.getByRole("button", { name: "New category" }));
    fireEvent.change(screen.getByLabelText("Name"), { target: { value: "Snacks" } });
    fireEvent.click(screen.getByRole("button", { name: "Save" }));

    // The new leaf is in the tree, with its own actions row.
    expect(screen.getByRole("button", { name: "Snacks actions" })).toBeDefined();
    // `Uncategorized` is still the row shown apart, with its own count — and
    // still shown exactly once, not once apart and once inside the tree.
    expect(screen.getAllByText("Uncategorized")).toHaveLength(1);
    expect(screen.getByText("12 transactions")).toBeDefined();
    // The row shown apart carries no actions button; the tree's rows do. A
    // `Snacks` that had taken the Uncategorized slot would have neither.
    expect(screen.queryByRole("button", { name: "Uncategorized actions" })).toBeNull();
  });

  /** The action stays on the ground once the tree exists — it is how the tree grows. */
  it("creates a leaf under a chosen group, from the persistent action", () => {
    withLedger(<CategoriesScreen />, fakeController({ categories: tree, categoryUsage: usage }));

    fireEvent.click(screen.getByRole("button", { name: "New category" }));
    fireEvent.change(screen.getByLabelText("Name"), { target: { value: "Bakery" } });
    fireEvent.click(screen.getByRole("button", { name: "Group" }));
    fireEvent.click(screen.getByRole("radio", { name: "Food" }));
    fireEvent.click(screen.getByRole("button", { name: "Save" }));

    expect(screen.getByText("Bakery")).toBeDefined();
  });

  /** The sibling collision the controller refuses, on the field it is about. */
  it("shows a create refusal inline, without closing the sheet", () => {
    withLedger(<CategoriesScreen />, fakeController({ categories: tree, categoryUsage: usage }));

    fireEvent.click(screen.getByRole("button", { name: "New category" }));
    fireEvent.change(screen.getByLabelText("Name"), { target: { value: "Uncategorized" } });
    fireEvent.click(screen.getByRole("button", { name: "Save" }));

    expect(screen.getByText('"Uncategorized" already exists here')).toBeDefined();
  });

  it("filters the tree by search, keeping a matched leaf's group visible", () => {
    withLedger(<CategoriesScreen />, fakeController({ categories: tree, categoryUsage: usage }));

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
    withLedger(
      <CategoriesScreen />,
      fakeController({ categories: archivedTree, categoryUsage: usage }),
    );

    expect(screen.queryByText("Old subscriptions")).toBeNull();
    fireEvent.click(screen.getByRole("switch", { name: "Show archived" }));
    expect(screen.getByText("Old subscriptions")).toBeDefined();
  });

  it("renames a category end to end, through the actions sheet", () => {
    withLedger(<CategoriesScreen />, fakeController({ categories: tree, categoryUsage: usage }));

    fireEvent.click(screen.getByRole("button", { name: "Groceries actions" }));
    fireEvent.click(screen.getByRole("button", { name: "Rename" }));
    fireEvent.change(screen.getByLabelText("Name"), {
      target: { value: "Groceries & household" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Save" }));

    expect(screen.getByText("Groceries & household")).toBeDefined();
  });

  it("names the direction it just converted — group vs leaf are different Toasts", () => {
    withLedger(<CategoriesScreen />, fakeController({ categories: tree, categoryUsage: usage }));

    fireEvent.click(screen.getByRole("button", { name: "Eating out actions" }));
    fireEvent.click(screen.getByRole("button", { name: "Convert to group" }));
    expect(screen.getByText("Convert to group")).toBeDefined(); // the Toast, not the button

    fireEvent.click(screen.getByRole("button", { name: "Eating out actions" }));
    fireEvent.click(screen.getByRole("button", { name: "Convert to leaf" }));
    expect(screen.getByText("Convert to leaf")).toBeDefined();
  });

  it("shows the sibling-collision refusal inline, without closing the sheet", () => {
    withLedger(<CategoriesScreen />, fakeController({ categories: tree, categoryUsage: usage }));

    fireEvent.click(screen.getByRole("button", { name: "Eating out actions" }));
    fireEvent.click(screen.getByRole("button", { name: "Rename" }));
    fireEvent.change(screen.getByLabelText("Name"), { target: { value: "groceries" } });
    fireEvent.click(screen.getByRole("button", { name: "Save" }));

    expect(screen.getByText('"Groceries" already exists here')).toBeDefined();
  });

  it("archives a category — it drops off the default list, no Undo offered", () => {
    withLedger(<CategoriesScreen />, fakeController({ categories: tree, categoryUsage: usage }));

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
    withLedger(
      <CategoriesScreen />,
      fakeController({ categories: collisionTree, categoryUsage: collisionUsage }),
    );

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
    withLedger(
      <CategoriesScreen />,
      fakeController({ categories: treeWithDuplicate, categoryUsage: usage }),
    );

    // The seeded expense leaf still shows apart, and the income leaf still
    // shows in the tree body — two rows, not one collapsed into the other.
    expect(screen.getAllByText("Uncategorized")).toHaveLength(2);
    expect(screen.getByRole("button", { name: "Uncategorized actions" })).toBeDefined();
  });

  // M2 — `messageOf` read only `FieldError.message`, so a Polish reader saw
  // the English fallback. `moveCategory`'s cross-kind refusal is unreachable
  // through the picker itself (`moveGroups` filters to the leaf's own kind,
  // and the controller's own guard is the same check), so this overrides the
  // controller's `moveCategory` directly — the same shape as
  // `account-editor-screen.test.tsx`'s overridden `updateAccount` — to prove
  // `categories-screen.tsx`'s own `messageKey` resolution, independent of
  // whether the refusal is reachable in practice.
  it("resolves a moveAcrossKinds refusal to its Polish sentence, not the English message", () => {
    const controller = fakeController({ categories: tree, categoryUsage: usage });
    controller.moveCategory = vi.fn(() => ({
      fieldErrors: [
        {
          path: "parentId",
          message: "Food belongs to the expense side — a category cannot move across kinds",
          messageKey: "categories.moveAcrossKindsExpense",
          params: { name: "Food" },
        },
      ],
    }));

    render(
      <I18nProvider locale="pl">
        <LedgerProvider controller={controller}>
          <CategoriesScreen />
        </LedgerProvider>
      </I18nProvider>,
    );

    fireEvent.click(screen.getByRole("button", { name: "Działania dla Groceries" }));
    fireEvent.click(screen.getByRole("button", { name: "Przenieś" }));
    fireEvent.click(screen.getByRole("button", { name: "Grupa · Groceries" }));
    fireEvent.click(screen.getByRole("radio", { name: "Food" }));
    fireEvent.click(screen.getByRole("button", { name: "Zapisz" }));

    expect(
      screen.getByText("Food należy do strony wydatków — kategoria nie może zmienić strony"),
    ).toBeDefined();
    expect(
      screen.queryByText("Food belongs to the expense side — a category cannot move across kinds"),
    ).toBeNull();
  });
});

/**
 * **The pager's four pages, driven with rows.**
 *
 * Every other test here runs S04 on an empty ledger, which is the state that
 * says *nothing yet* and nothing else. These drive the real screen with a
 * month of transactions and read back what each page composed — the one check
 * that the pieces, each proven on its own in Storybook, add up to the screen
 * the spec describes.
 *
 * **Scoped to the page on screen.** All four pages are mounted at once, so an
 * unscoped text query finds rows from pages a reader cannot see. `getByRole`
 * skips what is hidden from the accessibility tree, which is the same set.
 */
describe("Today — the pager, with a month in it", () => {
  const TODAY = deviceRuntime().capture().date;
  const MONTH = TODAY.slice(0, 7);

  function row(day: string, payee: string, amount: string, month = MONTH): PhoneSearchTransaction {
    return {
      id: id<"transactions">(`33333333-3333-4333-8333-33${month.replace("-", "")}${day.slice(-2)}`),
      date: accountingDate(`${month}-${day}`),
      type: amount.startsWith("-") ? "expense" : "income",
      payee,
      note: "",
      categoryName: "Groceries",
      brandKey: null,
      accountId: PLN_ACCOUNT.id,
      accountName: PLN_ACCOUNT.name,
      toAccountId: null,
      toAccountName: null,
      amount: toMoney(amount),
      currency: currencyCode("PLN"),
      decimals: 2,
      fxRate: money.pivotPerUnit("1"),
      fxRateEstimated: false,
      toAmount: null,
      toFxRate: null,
      toCurrency: null,
      toDecimals: null,
      isBusiness: false,
      isCapital: false,
      counterpartyRole: null,
    };
  }

  const LEDGER = [
    row("02", "Market B", "-96.00"),
    row("02", "Café A", "-48.90"),
    row("05", "Salary", "7850.00"),
    row("09", "Clinic G", "-180.00"),
  ];

  function open(
    view: "summary" | "list" | "calendar" | "months",
    date = `${MONTH}-09`,
    extra: {
      q?: string;
      currencies?: readonly PhoneCurrency[];
      ledger?: readonly PhoneSearchTransaction[];
      recent?: readonly PhoneRecentTransaction[];
    } = {},
  ) {
    useLocalSearchParams.mockReturnValue(
      extra.q === undefined ? { view, date } : { view, date, q: extra.q },
    );
    withLedger(
      <Today />,
      fakeController({
        accounts: [PLN_ACCOUNT],
        ...(extra.currencies === undefined ? {} : { currencies: extra.currencies }),
        ledger: extra.ledger ?? LEDGER,
        recent: extra.recent ?? [],
        transactionCount: LEDGER.length,
        periodSpend: [
          {
            currency: currencyCode("PLN"),
            decimals: 2,
            spend: toMoney("324.90"),
            inflow: toMoney("7850.00"),
            net: toMoney("7525.10"),
          },
        ],
      }),
    );
    return within(screen.getByRole("tabpanel"));
  }

  it("offers all four pages, and says which one is showing", () => {
    open("summary");
    for (const name of ["Summary", "List", "Calendar", "Months"]) {
      expect(screen.getByRole("tab", { name })).toBeTruthy();
    }
    expect(screen.getByRole("tab", { name: "Summary" }).getAttribute("aria-selected")).toBe("true");
  });

  it("draws Summary's month as three labelled figures, each with its currency", () => {
    // §3's hero. The bar between them is decorative and says the same
    // subtraction, so what a reader must be able to read is these.
    const summary = open("summary");
    expect(summary.getByText("Kept so far")).toBeTruthy();
    expect(summary.getByText("Came in")).toBeTruthy();
    expect(summary.getByText("Went out")).toBeTruthy();
    expect(summary.getAllByText("PLN").length).toBeGreaterThanOrEqual(3);
  });

  it("gives Summary's Go-to cards their figures, not just their names", () => {
    // §3: every card carries one, which is what makes the grid a status board
    // rather than a menu.
    open("summary");
    expect(screen.getByRole("button", { name: /^Currencies, / })).toBeTruthy();
  });

  it("walks List across days, and carries the ribbon that says where it is", () => {
    const list = open("list");
    // Every day of the loaded page, and every row on it — the list is the one
    // page that is the whole ledger rather than one period of it (§6).
    expect(list.getByRole("button", { name: /Clinic G/ })).toBeTruthy();
    expect(list.getByRole("button", { name: /Market B/ })).toBeTruthy();
    expect(list.getByRole("button", { name: /Salary/ })).toBeTruthy();
    // The ribbon reports the days, each named in full: a run of bare numbers
    // says nothing about which month or whether the day held anything (§7).
    const ribbon = list
      .getAllByRole("button")
      .filter((node) => /^[A-Z][a-z]+ \d+, \d{4}/.test(node.getAttribute("aria-label") ?? ""));
    expect(ribbon.length).toBeGreaterThan(0);
  });

  it("marks the days that held something on Calendar, and leaves the rest bare", () => {
    const calendar = open("calendar");
    // Every day of the month is a cell whether or not it holds anything — the
    // grid's shape must not change with its contents.
    const cells = calendar.getAllByRole("button").filter((node) => {
      const label = node.getAttribute("aria-label") ?? "";
      return /^[A-Z][a-z]+ \d+, \d{4}/.test(label);
    });
    expect(cells.length).toBeGreaterThanOrEqual(28);
    const quiet = cells.filter((node) =>
      (node.getAttribute("aria-label") ?? "").includes("nothing"),
    );
    expect(quiet.length).toBeGreaterThan(0);
    expect(quiet.length).toBeLessThan(cells.length);
  });

  /**
   * Summary's last days are the List's read, folded the List's way, so a row
   * there is the same row and opens the same screen. There is no *Show all*:
   * the List is one swipe away.
   */
  it("draws the last days on Summary as day groups whose rows open the transaction", () => {
    const summary = open("summary");
    // The two latest days of the page read from today, newest first — and no
    // further: the 2nd is the List's to show.
    expect(summary.getByText("September 9, 2026")).toBeTruthy();
    expect(summary.getByText("September 5, 2026")).toBeTruthy();
    expect(summary.queryByText("September 2, 2026")).toBeNull();
    expect(summary.queryByText("Show all →")).toBeNull();
    fireEvent.click(summary.getByRole("button", { name: /Clinic G/ }));
    expect(router.push).toHaveBeenCalledWith(
      expect.objectContaining({ pathname: "/transaction/[id]" }),
    );
  });

  it("opens the tapped day's entries under the Calendar's grid", () => {
    // §3, and the reason `readDayRows` is bounded by the date: the panel shows
    // the day, not the first page of a ledger that happens to start there.
    const calendar = open("calendar");
    expect(calendar.getByRole("button", { name: /Clinic G/ })).toBeTruthy();
    expect(calendar.queryByRole("button", { name: /Market B/ })).toBeNull();
  });

  /**
   * **The blank half of the calendar meant three things and said none of them**
   * (`design-system/08` §8.1). Each of the three below rendered as the same
   * silence under the grid: a month the ledger never reached, a day the reader
   * happened to tap, and a search with no answer here.
   */
  it("names the nearest month, and how much is in it, from a month with nothing", () => {
    // Nine months before the ledger's own rows — a `range` empty, never an
    // error: a month with no spending is a legitimate answer (§8.6).
    const calendar = open("calendar", `${Number(MONTH.slice(0, 4)) - 1}-12-05`);

    expect(calendar.getByText(/^Nothing in December$/)).toBeTruthy();
    expect(calendar.getByText(/nearest month with anything — 4 entries/)).toBeTruthy();
    expect(calendar.queryByText("No transactions yet"), "the ledger is not empty").toBeNull();
  });

  it("jumps to the day it named, and stays on the Calendar", () => {
    const calendar = open("calendar", `${Number(MONTH.slice(0, 4)) - 1}-12-05`);

    fireEvent.click(calendar.getByRole("button", { name: /Go to/ }));
    // The date is held by the route (`usePagerRoute`), so the jump is a param
    // write — and it writes the nearest *day*, which for a gap being crossed
    // forwards is that month's earliest row (the 2nd here, not the 9th). The
    // panel underneath therefore opens on entries rather than on nothing,
    // which a jump to the month's first day would not guarantee.
    expect(router.setParams).toHaveBeenCalledWith(
      expect.objectContaining({ view: "calendar", date: `${MONTH}-02` }),
    );
  });

  /**
   * A day with nothing in a month with plenty is **not** an empty state — the
   * grid above it is full of marks. One quiet line, and it is the only thing
   * in that region that can say where the entries are.
   */
  it("points a quiet day at the nearest one that has something", () => {
    const calendar = open("calendar", `${MONTH}-07`);

    expect(calendar.getByText("nothing"), "the day's own figure").toBeTruthy();
    expect(calendar.getByText(/Nearest entries:/)).toBeTruthy();
    expect(calendar.queryByText(/^Nothing in /), "the month is not empty").toBeNull();
  });

  /**
   * `filtered`, not `range`: the month may be full of rows, and what excludes
   * them is the query. §8.1 calls this the one that gets built wrong, because
   * a message that does not name the excluding filter sends the reader hunting.
   */
  it("blames the search, not the month, when a search has no answer here", () => {
    const calendar = open("calendar", `${MONTH}-09`, { q: "zzz" });

    expect(calendar.getByText(/^No matches in /)).toBeTruthy();
    expect(calendar.getByText(/zzz/)).toBeTruthy();
    expect(calendar.queryByText(/nearest month/), "the rows are here, unmatched").toBeNull();
  });

  /**
   * **H — the day total was converted and the label was not.**
   *
   * `toLedgerItems` takes every row to the *pivot* at its own rate; the header
   * was labelling that figure with `netWorth[0]` — the currency of your first
   * account. With a USD pivot and a PLN account, a day holding one 180 PLN
   * expense drew *-50.00 PLN* over a row reading *-180.00 PLN*: two figures in
   * the same currency, four pixels apart, disagreeing. They agree in a
   * one-currency ledger, which is why it survived.
   */
  it("labels the day total with the currency it is actually in", () => {
    const calendar = open("calendar", `${MONTH}-09`, {
      currencies: [
        {
          code: currencyCode("USD"),
          name: "US dollar",
          symbol: "$",
          decimals: 2,
          capturable: true,
          isPivot: true,
        },
        {
          code: currencyCode("PLN"),
          name: "Polish Złoty",
          symbol: "zł",
          decimals: 2,
          capturable: true,
          isPivot: false,
        },
      ],
    });

    // One row at rate 1, so both figures read -180.00 and the *labels* are the
    // whole assertion: the row keeps its own currency, the total names the
    // pivot it was converted to, and the two are allowed to differ only
    // because they genuinely are two different things.
    const labels = calendar
      .getAllByText(/^-180\.00$|^−180,00$/)
      .map((node) => node.parentElement?.textContent ?? "");
    expect(
      labels.some((line) => line.includes("USD")),
      labels.join(" | "),
    ).toBe(true);
    expect(
      labels.some((line) => line.includes("PLN")),
      labels.join(" | "),
    ).toBe(true);
  });

  /**
   * **H — the nearest month must be measured from the month, not from the
   * square the reader last touched.**
   *
   * One read served both the month's empty state and the quiet line under a
   * day, so the same empty July said *June — 1 entry* or *August — 50 entries*
   * depending on how you arrived: the picker lands on a month's last day, the
   * ← arrow keeps the day-of-month. Arriving on the 1st from August then sent
   * the reader backwards, past the month they had just left.
   */
  it("names the same nearest month wherever in the month you landed", () => {
    const across = [
      row("25", "Market B", "-96.00", "2026-06"),
      row("01", "Salary", "7850.00", "2026-08"),
      row("14", "Café A", "-48.90", "2026-08"),
    ];
    const said = (date: string) => {
      const calendar = open("calendar", date, { ledger: across });
      const line = calendar.getByText(/nearest month with anything/).textContent ?? "";
      cleanup();
      return line;
    };

    expect(said("2026-07-01")).toContain("August");
    expect(said("2026-07-31")).toBe(said("2026-07-01"));
  });

  /**
   * **H — "No transactions yet" is a claim about the ledger, and the calendar
   * cannot see all of it.** A ledger held entirely in shared accounts or in
   * transfers draws nothing here while List shows every row. The copy must say
   * what this page draws instead of denying the rows exist.
   */
  it("does not call a ledger empty just because this page draws none of it", () => {
    const calendar = open("calendar", `${MONTH}-09`, { ledger: [], recent: [RECENT_ROW] });

    expect(calendar.getByText(/income and expenses on your own accounts/)).toBeTruthy();
    expect(calendar.queryByText(/Capture your first/), "the rows are on List").toBeNull();
  });

  it("still says first-run when the ledger really is empty", () => {
    const calendar = open("calendar", `${MONTH}-09`, { ledger: [], recent: [] });

    expect(calendar.getByText("No transactions yet")).toBeTruthy();
    expect(calendar.getByText(/Capture your first/)).toBeTruthy();
  });

  /**
   * The quiet line points at the nearest *unfiltered* day, which under a search
   * may match nothing — so under a search it is not drawn at all. The grid's
   * own counts are what answer *how often, and when* while one is on (§7).
   */
  it("does not offer an unfiltered day while a search is on", () => {
    const calendar = open("calendar", `${MONTH}-07`, { q: "Market" });

    expect(calendar.queryByText(/Nearest entries:/)).toBeNull();
  });

  /**
   * **Opening the month picker must not redraw the pages behind it.**
   *
   * The pager keeps all four mounted, so anything that hands them fresh
   * elements re-renders every one of them — and a chain of four inline
   * elements did exactly that, so a sheet appearing redrew the calendar
   * underneath it. Measured in Chrome at the time; this is what keeps it
   * measured.
   *
   * Counted through the calendar's `labelFor`, which the grid calls once per
   * drawn day per render: no counter inside a component, and nothing to
   * remove afterwards.
   */
  it("draws nothing again when the month picker opens over it", () => {
    open("calendar");
    const cellsBefore = screen
      .getAllByRole("button")
      .filter((node) => /^[A-Z][a-z]+ \d+, \d{4}/.test(node.getAttribute("aria-label") ?? ""));

    act(() => {
      screen.getAllByRole("button", { name: "Choose a month" })[0]?.click();
    });

    // The same element objects, not merely the same count: React keeps a node
    // it did not re-render, and replaces the one it did.
    const cellsAfter = screen
      .getAllByRole("button")
      .filter((node) => /^[A-Z][a-z]+ \d+, \d{4}/.test(node.getAttribute("aria-label") ?? ""));
    expect(cellsAfter[0]).toBe(cellsBefore[0]);
    expect(cellsAfter.at(-1)).toBe(cellsBefore.at(-1));
  });

  it("gives Months twelve rows, the current one marked", () => {
    const months = open("months");
    const rows = months
      .getAllByRole("button")
      .filter((node) => /Came in/.test(node.getAttribute("aria-label") ?? ""));
    expect(rows).toHaveLength(12);
    expect(rows.filter((node) => node.getAttribute("aria-selected") === "true")).toHaveLength(1);
  });
});
