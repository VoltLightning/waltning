/**
 * @vitest-environment jsdom
 *
 * S16's register, rendered under `react-native-web` against an in-memory
 * ledger — the shape `screens.test.tsx` already uses. Its own file: the
 * fixture this screen needs (multiple kinds, a shared account, an archived
 * one) does not fit the three-route file's narrower `FakeAccount`.
 */

import { fireEvent, render, screen } from "@testing-library/react";
import {
  createPhoneLedger,
  type PhoneLedgerPort,
} from "@waltning/client/ledger/create-phone-ledger";
import { LedgerProvider } from "@waltning/client/ledger/ledger-provider";
import { accountingDate } from "@waltning/core/date";
import { id } from "@waltning/core/id";
import { currencyCode, toMoney } from "@waltning/core/money";
import { beforeEach, describe, expect, it, vi } from "vitest";

const router = { push: vi.fn(), back: vi.fn(), dismissTo: vi.fn() };
const useLocalSearchParams = vi.fn(() => ({}));

vi.mock("expo-router", () => ({
  get router() {
    return router;
  },
  useLocalSearchParams: () => useLocalSearchParams(),
}));

import Accounts from "./accounts-screen";

const PLN = currencyCode("PLN");
const USD = currencyCode("USD");

type Row = {
  id: string;
  name: string;
  kind: "bank" | "cash" | "clearing" | "deposit";
  currency: typeof PLN;
  ownership: "own" | "shared";
  isBusiness: boolean;
  balance: string;
  archived?: boolean;
};

function fakeController(rows: readonly Row[]) {
  const accounts = rows.map((row) => ({
    id: id<"accounts">(row.id),
    name: row.name,
    kind: row.kind,
    currency: row.currency,
    decimals: 2,
    balance: toMoney(row.balance),
    groupId: null,
    ownership: row.ownership,
    isBusiness: row.isBusiness,
    archived: row.archived ?? false,
    expectedBalance: null,
    openingBalance: toMoney(row.balance),
    openingDate: null,
    memo: "",
    version: 1,
  }));
  const port: PhoneLedgerPort = {
    listAccounts: (options) =>
      options?.includeArchived ? accounts : accounts.filter((a) => !a.archived),
    listCurrencies: () => [
      {
        code: PLN,
        name: "Polish Złoty",
        symbol: "zł",
        decimals: 2,
        capturable: true,
        isPivot: true,
      },
      { code: USD, name: "US dollar", symbol: "$", decimals: 2, capturable: true, isPivot: false },
    ],
    listGroups: () => [],
    listRecent: () => [],
    listCategories: () => [],
    listCategoryTree: () => [],
    listCounterparties: () => [],
    listPayeeHistory: () => [],
    listNetWorth: () => [],
    readPeriodSpend: () => [],
    listUnsettledClearing: () => [],
    listCounterpartyBalances: () => [],
    listCounterpartyMerges: () => [],
    listDistinctCounterpartyPairs: () => [],
    balanceAsOf: () => toMoney("0"),
    createAccount: vi.fn(),
    createTransaction: vi.fn(),
    createCategory: vi.fn(),
    updateAccount: vi.fn(),
    archiveAccount: vi.fn(),
    reconcileAccount: vi.fn(),
    createGroup: vi.fn(),
    createCounterparty: vi.fn(),
    updateCounterparty: vi.fn(),
    mergeCounterparties: vi.fn(),
    unmergeCounterparties: vi.fn(),
    recordDistinctCounterparties: vi.fn(),
    settleDebt: vi.fn(() => ({ residual: toMoney("0"), overSettled: false })),
    searchTransactions: () => ({
      rows: [],
      nextCursor: undefined,
      total: { count: 0, currencies: [] },
    }),
    categorizeBatch: () => undefined,
    getTransaction: () => null,
    updateTransaction: () => undefined,
    deleteTransaction: () => undefined,
    setTransactionLines: () => undefined,
    readRate: () => null,
    readCrossRate: () => null,
    listCurrencySettings: () => [],
    readCoverage: () => [],
    listFxRates: () => [],
    addCurrency: vi.fn(),
    archiveCurrency: vi.fn(),
    setRateSource: vi.fn(),
    setPinned: vi.fn(),
    changePivot: vi.fn(() => ({ droppedDates: 0 })),
    setManualRate: vi.fn(() => ({ written: 0, replacedManual: 0 })),
    clearManualRate: vi.fn(() => ({ deleted: 0 })),
    updateCurrency: vi.fn(),
    listFullCategoryTree: vi.fn(() => []),
    listCategoryUsage: vi.fn(() => new Map()),
    readCategoryReferenceCounts: vi.fn(() => ({ transactions: 0, lines: 0, rules: 0 })),
    renameCategory: vi.fn(),
    reparentCategory: vi.fn(),
    convertLeafGroup: vi.fn(),
    mergeCategories: vi.fn(),
    archiveCategory: vi.fn(),
    reset: vi.fn(),
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

function withLedger(rows: readonly Row[]) {
  return render(
    <LedgerProvider controller={fakeController(rows)}>
      <Accounts />
    </LedgerProvider>,
  );
}

beforeEach(() => {
  router.push.mockClear();
  router.dismissTo.mockClear();
  useLocalSearchParams.mockReturnValue({});
});

describe("Accounts", () => {
  it("shows the first-run empty state and pushes account/new with returnTo=accounts", () => {
    withLedger([]);
    expect(screen.getByText("No accounts yet")).toBeDefined();
    fireEvent.click(screen.getByRole("button", { name: "Create account…" }));
    expect(router.push).toHaveBeenCalledWith({
      pathname: "/account/new",
      params: { returnTo: "accounts" },
    });
  });

  it("groups a populated register by kind, each with its own subtotal", () => {
    withLedger([
      {
        id: "acc-1",
        name: "Bank A · PLN",
        kind: "bank",
        currency: PLN,
        ownership: "own",
        isBusiness: false,
        balance: "100",
      },
      {
        id: "acc-2",
        name: "Cash · PLN",
        kind: "cash",
        currency: PLN,
        ownership: "own",
        isBusiness: false,
        balance: "50",
      },
    ]);
    expect(screen.getAllByText("Bank").length).toBeGreaterThan(0);
    expect(screen.getAllByText("Cash").length).toBeGreaterThan(0);
  });

  it("holds a shared account apart from the kind groups", () => {
    withLedger([
      {
        id: "acc-1",
        name: "Bank A · PLN",
        kind: "bank",
        currency: PLN,
        ownership: "own",
        isBusiness: false,
        balance: "100",
      },
      {
        id: "acc-2",
        name: "Household · USD",
        kind: "deposit",
        currency: USD,
        ownership: "shared",
        isBusiness: false,
        balance: "500",
      },
    ]);
    expect(screen.getByText("Shared")).toBeDefined();
  });

  it("keeps an archived account out of sight until the toggle opens", () => {
    withLedger([
      {
        id: "acc-1",
        name: "Bank A · PLN",
        kind: "bank",
        currency: PLN,
        ownership: "own",
        isBusiness: false,
        balance: "100",
      },
      {
        id: "acc-2",
        name: "Old · PLN",
        kind: "bank",
        currency: PLN,
        ownership: "own",
        isBusiness: false,
        balance: "0",
        archived: true,
      },
    ]);
    expect(screen.queryByText("Old · PLN")).toBeNull();
    fireEvent.click(screen.getByText("Archived"));
    expect(screen.getByText("Old · PLN")).toBeDefined();
  });

  it("tapping a row pushes /accounts/{id}", () => {
    withLedger([
      {
        id: "acc-1",
        name: "Bank A · PLN",
        kind: "bank",
        currency: PLN,
        ownership: "own",
        isBusiness: false,
        balance: "100",
      },
    ]);
    fireEvent.click(screen.getByRole("button", { name: "Bank A · PLN" }));
    expect(router.push).toHaveBeenCalledWith("/accounts/acc-1");
  });

  it("shows a Toast from the message param — the archive confirmation", () => {
    useLocalSearchParams.mockReturnValue({ message: "Account archived.", nonce: "1" });
    withLedger([]);
    expect(screen.getByRole("alert").textContent).toContain("Account archived.");
  });

  /**
   * M3: the screen can stay mounted across two archives in a row
   * (`account-editor-screen.tsx`'s `dismissTo`) — `message` has to be read
   * on every arrival, not only at mount (`useState(message ?? null)` would
   * miss a second one entirely).
   */
  it("shows the archive toast again after a dismissTo that arrives on the mounted screen", () => {
    useLocalSearchParams.mockReturnValue({ message: "Account archived.", nonce: "1" });
    const { rerender } = withLedger([]);
    expect(screen.getByRole("alert").textContent).toContain("Account archived.");

    fireEvent.click(screen.getByRole("button", { name: "Dismiss" }));
    expect(screen.queryByRole("alert")).toBeNull();

    useLocalSearchParams.mockReturnValue({ message: "Account archived.", nonce: "2" });
    rerender(
      <LedgerProvider controller={fakeController([])}>
        <Accounts />
      </LedgerProvider>,
    );

    expect(screen.getByRole("alert").textContent).toContain("Account archived.");
  });
});
