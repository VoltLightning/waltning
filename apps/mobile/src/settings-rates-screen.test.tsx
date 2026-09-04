/**
 * @vitest-environment jsdom
 *
 * S18 against an in-memory ledger — the shape `account-editor-screen.
 * test.tsx` already uses for a full `PhoneLedgerPort`.
 */

import { fireEvent, render, screen } from "@testing-library/react";
import {
  createPhoneLedger,
  type PhoneLedgerPort,
} from "@waltning/client/ledger/create-phone-ledger";
import { LedgerProvider } from "@waltning/client/ledger/ledger-provider";
import { accountingDate } from "@waltning/core/date";
import { id } from "@waltning/core/id";
import { currencyCode, toMoney, unitsPerPivot } from "@waltning/core/money";
import { beforeEach, expect, it, vi } from "vitest";

const router = { push: vi.fn(), back: vi.fn(), dismissTo: vi.fn() };
const useLocalSearchParams = vi.fn(() => ({}) as { quote?: string });

vi.mock("expo-router", () => ({
  get router() {
    return router;
  },
  useLocalSearchParams: () => useLocalSearchParams(),
}));

import SettingsRatesScreen from "./settings-rates-screen";

const PLN = currencyCode("PLN");
const USD = currencyCode("USD");
const EUR = currencyCode("EUR");

const PLN_ROW = {
  code: PLN,
  name: "Polish Złoty",
  symbol: "zł",
  symbolPosition: "S",
  decimals: 2,
  rateSource: "nbp",
  pinned: true,
  isPivot: false,
  version: 3,
};

const USD_ROW = {
  code: USD,
  name: "US Dollar",
  symbol: "$",
  symbolPosition: "P",
  decimals: 2,
  rateSource: null,
  pinned: false,
  isPivot: true,
  version: 1,
};

const EUR_ROW = {
  code: EUR,
  name: "Euro",
  symbol: "€",
  symbolPosition: "S",
  decimals: 2,
  rateSource: "ecb",
  pinned: false,
  isPivot: false,
  version: 1,
};

function fakeController(overrides: {
  listCurrencySettings?: PhoneLedgerPort["listCurrencySettings"];
  listFxRates?: PhoneLedgerPort["listFxRates"];
  setManualRate?: PhoneLedgerPort["setManualRate"];
  clearManualRate?: PhoneLedgerPort["clearManualRate"];
}) {
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
    listUnsettledClearing: () => [],
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
    listCurrencySettings: overrides.listCurrencySettings ?? (() => [PLN_ROW, USD_ROW]),
    readCoverage: () => [
      {
        code: PLN,
        source: "nbp",
        firstDate: accountingDate("2020-11-25"),
        lastDate: accountingDate("2026-09-02"),
        days: 2100,
        calendarDays: 2100,
        coveragePct: 100,
      },
    ],
    listFxRates: overrides.listFxRates ?? (() => []),
    addCurrency: vi.fn(),
    archiveCurrency: vi.fn(),
    setRateSource: vi.fn(),
    setPinned: vi.fn(),
    changePivot: vi.fn(),
    setManualRate: overrides.setManualRate ?? vi.fn(() => ({ written: 0, replacedManual: 0 })),
    clearManualRate: overrides.clearManualRate ?? vi.fn(() => ({ deleted: 0 })),
    updateCurrency: vi.fn(),
    listCounterpartyBalances: vi.fn(() => []),
    listFullCategoryTree: vi.fn(() => []),
    listCategoryUsage: vi.fn(() => new Map()),
    readCategoryReferenceCounts: vi.fn(() => ({ transactions: 0, lines: 0, rules: 0 })),
    renameCategory: vi.fn(),
    reparentCategory: vi.fn(),
    convertLeafGroup: vi.fn(),
    mergeCategories: vi.fn(),
    archiveCategory: vi.fn(),
    readCrossRate: vi.fn(() => null),
    reset: vi.fn(),
  };
  return createPhoneLedger(port, {
    capture: () => ({
      date: accountingDate("2026-09-03"),
      timeZone: "Europe/Warsaw",
      offsetMinutes: 120,
      at: new Date("2026-09-03T10:00:00Z"),
    }),
    id: () => id("44444444-4444-4444-8444-444444444444"),
  });
}

function withLedger(overrides: Parameters<typeof fakeController>[0] = {}) {
  return render(
    <LedgerProvider controller={fakeController(overrides)}>
      <SettingsRatesScreen />
    </LedgerProvider>,
  );
}

beforeEach(() => {
  router.push.mockClear();
  useLocalSearchParams.mockReturnValue({});
});

it("renders the quote pair and the coverage panel", () => {
  withLedger();
  expect(screen.getByText("PLN · Polish Złoty")).toBeDefined();
  expect(screen.getByText("100%")).toBeDefined();
});

it("preselects the quote from ?quote=, S17's own link at 0% coverage", () => {
  useLocalSearchParams.mockReturnValue({ quote: "EUR" });
  withLedger({ listCurrencySettings: () => [PLN_ROW, EUR_ROW, USD_ROW] });
  // Without the param, the first option (PLN) would win — EUR proves the
  // link, not the default.
  expect(screen.getByText("EUR · Euro")).toBeDefined();
});

it("a range write with no existing manual rows submits on the first press", () => {
  const setManualRate = vi.fn(() => ({ written: 30, replacedManual: 0 }));
  withLedger({ setManualRate, listFxRates: () => [] });

  fireEvent.click(screen.getByText("Set a range"));
  fireEvent.change(screen.getByLabelText("Rate · PLN per USD"), { target: { value: "3,7556" } });
  fireEvent.click(screen.getByRole("button", { name: "Set rate" }));

  expect(setManualRate).toHaveBeenCalledWith(
    expect.objectContaining({ base: "USD", quote: "PLN", rate: "3.7556", overwriteManual: false }),
    expect.anything(),
  );
});

it("a range holding manual rows asks for a second confirmation before overwriting", () => {
  const setManualRate = vi.fn(() => ({ written: 3, replacedManual: 1 }));
  const listFxRates = vi.fn(() => [
    {
      base: USD,
      quote: PLN,
      date: accountingDate("2026-08-15"),
      rate: unitsPerPivot("3.9000"),
      source: "manual",
    },
  ]);
  withLedger({ setManualRate, listFxRates });

  fireEvent.click(screen.getByText("Set a range"));
  fireEvent.change(screen.getByLabelText("Rate · PLN per USD"), { target: { value: "3.7556" } });
  fireEvent.click(screen.getByRole("button", { name: "Set rate" }));
  expect(setManualRate).not.toHaveBeenCalled();
  expect(screen.getByText(/This sets 3\.7556 PLN per USD, replacing 1 manual rate/)).toBeDefined();

  fireEvent.click(screen.getByRole("button", { name: "Overwrite and set" }));
  expect(setManualRate).toHaveBeenCalledWith(
    expect.objectContaining({ overwriteManual: true }),
    expect.anything(),
  );
});

it("clear manual removes the manual rows in the current range", () => {
  const clearManualRate = vi.fn(() => ({ deleted: 3 }));
  withLedger({ clearManualRate });
  fireEvent.click(screen.getByText("Clear manual"));
  expect(clearManualRate).toHaveBeenCalledWith(
    expect.objectContaining({ base: "USD", quote: "PLN" }),
    expect.anything(),
  );
});
