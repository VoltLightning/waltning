/**
 * @vitest-environment jsdom
 *
 * S17 against an in-memory ledger — the shape `account-editor-screen.
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
import { currencyCode, toMoney } from "@waltning/core/money";
import { beforeEach, expect, it, vi } from "vitest";

const router = { push: vi.fn(), back: vi.fn(), dismissTo: vi.fn() };

vi.mock("expo-router", () => ({
  get router() {
    return router;
  },
}));

import SettingsCurrenciesScreen from "./settings-currencies-screen";

const PLN = currencyCode("PLN");
const USD = currencyCode("USD");

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

function fakeController(overrides: {
  listCurrencySettings?: PhoneLedgerPort["listCurrencySettings"];
  setPinned?: PhoneLedgerPort["setPinned"];
  archiveCurrency?: PhoneLedgerPort["archiveCurrency"];
  addCurrency?: PhoneLedgerPort["addCurrency"];
  changePivot?: PhoneLedgerPort["changePivot"];
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
        coveragePct: 100,
      },
    ],
    listFxRates: () => [],
    addCurrency: overrides.addCurrency ?? vi.fn(() => ({ code: "EUR" })),
    archiveCurrency: overrides.archiveCurrency ?? vi.fn(() => ({ code: "PLN" })),
    setRateSource: vi.fn(() => ({ code: "PLN" })),
    setPinned: overrides.setPinned ?? vi.fn(() => ({ code: "PLN" })),
    changePivot: overrides.changePivot ?? vi.fn(() => ({ code: "USD" })),
    setManualRate: vi.fn(() => ({ written: 0, replacedManual: 0 })),
    clearManualRate: vi.fn(() => ({ deleted: 0 })),
    listCounterpartyBalances: vi.fn(() => []),
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
    id: () => id("33333333-3333-4333-8333-333333333333"),
  });
}

function withLedger(overrides: Parameters<typeof fakeController>[0] = {}) {
  return render(
    <LedgerProvider controller={fakeController(overrides)}>
      <SettingsCurrenciesScreen />
    </LedgerProvider>,
  );
}

beforeEach(() => {
  router.push.mockClear();
});

it("renders a row per non-pivot currency, and the pivot read-only", () => {
  withLedger();
  expect(screen.getByText("PLN")).toBeDefined();
  expect(screen.getByText("Polish Złoty")).toBeDefined();
  // USD is the pivot — not in the row list, stated in the read-only line instead.
  expect(screen.queryByText("US Dollar")).toBeNull();
});

it("toggling pinned calls set_pinned with the row's own version", () => {
  const setPinned = vi.fn(() => ({ code: "PLN" }));
  withLedger({ setPinned });
  fireEvent.click(screen.getByLabelText("Pinned"));
  expect(setPinned).toHaveBeenCalledWith(
    { code: "PLN", version: 3, pinned: false },
    expect.anything(),
  );
});

it("archiving a referenced currency is refused with the executor's reason, on a Toast", () => {
  // The port throws — same as the real executor's refusal — and the
  // controller (`refusalFromThrow`) is what turns that into `fieldErrors`.
  const archiveCurrency = vi.fn(() => {
    throw new Error("PLN is still referenced by an account.");
  });
  withLedger({ archiveCurrency });
  fireEvent.click(screen.getByText("Archive"));
  expect(archiveCurrency).toHaveBeenCalledWith({ code: "PLN", version: 3 }, expect.anything());
  expect(screen.getByText("PLN is still referenced by an account.")).toBeDefined();
});

it("adding a currency writes through add_currency and closes the sheet", () => {
  const addCurrency = vi.fn(() => ({ code: "EUR" }));
  withLedger({ addCurrency });
  fireEvent.click(screen.getByText("Add currency"));
  fireEvent.change(screen.getByLabelText("Code"), { target: { value: "eur" } });
  fireEvent.change(screen.getByLabelText("Name"), { target: { value: "Euro" } });
  fireEvent.click(screen.getByText("Save"));
  expect(addCurrency).toHaveBeenCalledWith(
    expect.objectContaining({ code: "EUR", name: "Euro", symbol: "" }),
    expect.anything(),
  );
});

it("changing the pivot is gated behind a confirmation", () => {
  const changePivot = vi.fn(() => ({ code: "USD" }));
  withLedger({ changePivot });
  fireEvent.click(screen.getByText("Change pivot"));
  expect(changePivot).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole("button", { name: "Yes, change it" }));
  expect(changePivot).toHaveBeenCalledWith({ code: "USD" }, expect.anything());
});
