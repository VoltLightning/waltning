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

import { fireEvent, render, screen } from "@testing-library/react";
import {
  createPhoneLedger,
  type PhoneLedgerPort,
  type PhoneNetWorth,
} from "@waltning/client/ledger/create-phone-ledger";
import { LedgerProvider } from "@waltning/client/ledger/ledger-provider";
import { accountingDate } from "@waltning/core/date";
import { id } from "@waltning/core/id";
import {
  type BalanceRow,
  type ClearingAccountRow,
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
import DebtStub from "./debt-screen";
import LedgerStub from "./ledger-screen";
import QuickAdd from "./quick-add-screen";
import Today from "./today-screen";

type FakeAccount = {
  id: ReturnType<typeof id<"accounts">>;
  name: string;
  kind: "bank" | "clearing";
  currency: CurrencyCode;
  decimals: number;
  balance: Money;
  capturable: boolean;
  ownership?: "own" | "shared";
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
    bucket.rows.push({ ownership: account.ownership ?? "own", balance: account.balance });
    byCurrency.set(account.currency, bucket);
  }
  return [...byCurrency.entries()].map(([currency, { decimals, rows }]) => ({
    currency,
    decimals,
    ...netWorth(rows),
  }));
}

/** `money.unsettledClearing` (§8) over the clearing-kind fake accounts. */
function unsettledOf(accounts: readonly FakeAccount[]): readonly ClearingAccountRow[] {
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
  );
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
function fakeController(
  initialAccounts: readonly FakeAccount[] = [],
  periodSpendRows: readonly PeriodSpendRow[] = [],
) {
  let accounts = [...initialAccounts];
  const port: PhoneLedgerPort = {
    listAccounts: () => accounts,
    listCurrencies: () => [
      {
        code: currencyCode("PLN"),
        name: "Polish Złoty",
        symbol: "zł",
        decimals: 2,
        capturable: true,
      },
    ],
    listGroups: () => [],
    listRecent: () => [],
    listCategories: () => [],
    listCategoryTree: () => [],
    listCounterparties: () => [],
    listNetWorth: () => netWorthOf(accounts),
    readPeriodSpend: () => periodSpendRows,
    listUnsettledClearing: () => unsettledOf(accounts),
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
          ownership: input.ownership,
        },
      ];
    },
    createTransaction: () => undefined,
    createCategory: () => undefined,
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
  capturable: true,
};

const SHARED_ACCOUNT: FakeAccount = {
  id: id<"accounts">("33333333-3333-4333-8333-333333333333"),
  name: "Household · PLN",
  kind: "bank",
  currency: currencyCode("PLN"),
  decimals: 2,
  balance: toMoney("100"),
  capturable: true,
  ownership: "shared",
};

const CLEARING_ACCOUNT: FakeAccount = {
  id: id<"accounts">("44444444-4444-4444-8444-444444444444"),
  name: "Shared clearing",
  kind: "clearing",
  currency: currencyCode("PLN"),
  decimals: 2,
  balance: toMoney("340"),
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

  it("shows the period row's spent and net tiles from periodSpend", () => {
    const rows: readonly PeriodSpendRow[] = [
      {
        currency: currencyCode("PLN"),
        decimals: 2,
        spend: toMoney("-120.50"),
        net: toMoney("40.00"),
      },
    ];
    withLedger(<Today />, fakeController([PLN_ACCOUNT], rows));

    expect(screen.getByText("spent")).toBeDefined();
    expect(screen.getByText("net")).toBeDefined();
    const rendered = document.body.textContent ?? "";
    expect(rendered).toContain("-120.50");
    expect(rendered).toContain("40.00");
  });

  it("shows the unsettled banner and opens the ledger filtered to that account", () => {
    withLedger(<Today />, fakeController([PLN_ACCOUNT, CLEARING_ACCOUNT]));

    expect(screen.getByRole("alert")).toBeDefined();
    fireEvent.click(screen.getByText("Open"));
    expect(router.push).toHaveBeenCalledWith({
      pathname: "/ledger",
      params: { account: CLEARING_ACCOUNT.id },
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
        },
      ],
      listGroups: () => [],
      listRecent: () => [],
      listCategories: () => [],
      listCounterparties: () => [],
      listCategoryTree: () => [],
      listNetWorth: () => netWorthOf([PLN_ACCOUNT]),
      readPeriodSpend: () => [],
      listUnsettledClearing: () => [],
      createAccount: vi.fn(),
      createTransaction: vi.fn(),
      createCategory: vi.fn(),
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
});

describe("QuickAdd", () => {
  it("offers the ledger's accounts to capture against", () => {
    withLedger(<QuickAdd />, fakeController([PLN_ACCOUNT]));

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
 * The three tab stubs — S10/S11/S12 until their own arcs build the real
 * screen. Each names itself and offers the one honest way out: Today.
 */
describe("tab stubs", () => {
  it.each([
    ["Ledger", LedgerStub],
    ["Calendar", CalendarStub],
    ["Debt", DebtStub],
  ])("%s names itself and returns to Today", (title, Stub) => {
    render(<Stub />);
    expect(screen.getByText(title)).toBeDefined();
    fireEvent.click(screen.getByRole("button", { name: "Go to Today" }));
    expect(router.push).toHaveBeenCalledWith("/");
  });
});
