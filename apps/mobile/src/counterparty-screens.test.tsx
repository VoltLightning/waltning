/**
 * @vitest-environment jsdom
 *
 * S12, S13 and S15, rendered against an in-memory ledger — the shape
 * `account-editor-screen.test.tsx` and `screens.test.tsx` already use, in
 * one file because all three screens share the same counterparty fixture.
 */

import { fireEvent, render, screen } from "@testing-library/react";
import {
  createPhoneLedger,
  type PhoneCounterparty,
  type PhoneCounterpartyBalance,
  type PhoneLedgerPort,
  type PhoneSearchPage,
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

import CounterpartyDetail from "./counterparty-detail-screen";
import CounterpartyEditor from "./counterparty-editor-screen";
import Debt from "./debt-screen";

const PLN = currencyCode("PLN");
const TODAY = accountingDate("2026-09-03");
const NINA = id<"counterparties">("11111111-1111-4111-8111-111111111111");
const MAREK = id<"counterparties">("22222222-2222-4222-8222-222222222222");

const NINA_ROW: PhoneCounterpartyBalance = {
  counterpartyId: NINA,
  name: "Nina",
  kind: "person",
  settlementCurrency: PLN,
  currency: PLN,
  decimals: 2,
  balance: toMoney("840.00000000"),
  ageDays: null,
  bucket: null,
};

const NINA_COUNTERPARTY: PhoneCounterparty = {
  id: NINA,
  name: "Nina",
  kind: "person",
  settlementCurrency: PLN,
  contact: null,
  note: "",
  archived: false,
  version: 1,
};

const EMPTY_PAGE: PhoneSearchPage = {
  rows: [],
  nextCursor: undefined,
  total: { count: 0, currencies: [] },
};

/**
 * Every `PhoneLedgerPort` method, defaulted to the emptiest honest answer —
 * the same shape `screens.test.tsx`'s own `fakeController` builds, so a test
 * overrides only what it is actually about.
 */
function basePort(overrides: Partial<PhoneLedgerPort> = {}): PhoneLedgerPort {
  return {
    listAccounts: () => [],
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
    listRecent: () => [],
    listCategories: () => [],
    listCategoryTree: () => [],
    listCounterparties: () => [],
    listPayeeHistory: () => [],
    listCounterpartyBalances: () => [],
    listNetWorth: () => [],
    readPeriodSpend: () => [],
    listUnsettledClearing: () => [],
    balanceAsOf: () => toMoney("0"),
    searchTransactions: () => EMPTY_PAGE,
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
    readCoverage: () => [],
    listFxRates: () => [],
    addCurrency: () => undefined,
    archiveCurrency: () => undefined,
    setRateSource: () => undefined,
    setPinned: () => undefined,
    changePivot: () => undefined,
    setManualRate: () => ({ written: 0, replacedManual: 0 }),
    clearManualRate: () => ({ deleted: 0 }),
    createCounterparty: () => undefined,
    updateCounterparty: () => undefined,
    mergeCounterparties: () => undefined,
    unmergeCounterparties: () => undefined,
    recordDistinctCounterparties: () => undefined,
    settleDebt: () => ({ residual: toMoney("0"), overSettled: false }),
    reset: () => undefined,
    ...overrides,
  };
}

function controllerOf(port: PhoneLedgerPort) {
  return createPhoneLedger(port, {
    capture: () => ({
      date: TODAY,
      timeZone: "Europe/Warsaw",
      offsetMinutes: 120,
      at: new Date("2026-09-03T10:00:00Z"),
    }),
    id: () => id("99999999-9999-4999-8999-999999999999"),
  });
}

beforeEach(() => {
  router.push.mockClear();
  router.back.mockClear();
  router.dismissTo.mockClear();
  useLocalSearchParams.mockReturnValue({});
});

describe("Debt (S12)", () => {
  it("shows a counterparty row and the two direction totals", () => {
    const controller = controllerOf(
      basePort({
        listCounterparties: () => [NINA_COUNTERPARTY],
        listCounterpartyBalances: () => [NINA_ROW],
      }),
    );
    render(
      <LedgerProvider controller={controller}>
        <Debt />
      </LedgerProvider>,
    );
    expect(screen.getByText("Nina")).toBeDefined();
    expect(screen.getByText("owes you")).toBeDefined();
  });

  it("shows the first-run empty state with nothing on the ledger", () => {
    const controller = controllerOf(basePort());
    render(
      <LedgerProvider controller={controller}>
        <Debt />
      </LedgerProvider>,
    );
    expect(screen.getByText("No one yet")).toBeDefined();
  });

  it("shows the 'all settled' empty state — counterparties exist, nothing is open", () => {
    const controller = controllerOf(
      basePort({
        listCounterparties: () => [NINA_COUNTERPARTY],
        listCounterpartyBalances: () => [],
      }),
    );
    render(
      <LedgerProvider controller={controller}>
        <Debt />
      </LedgerProvider>,
    );
    expect(screen.getByText("All settled")).toBeDefined();
  });
});

describe("CounterpartyDetail (S13)", () => {
  beforeEach(() => useLocalSearchParams.mockReturnValue({ id: NINA }));

  it("shows the card, the ledger, and defaults history to debt rows", () => {
    const controller = controllerOf(
      basePort({
        listCounterparties: () => [NINA_COUNTERPARTY],
        listCounterpartyBalances: () => [NINA_ROW],
        searchTransactions: (filter) =>
          filter.counterpartyRole === "debt"
            ? { rows: [], nextCursor: undefined, total: { count: 1, currencies: [] } }
            : { rows: [], nextCursor: undefined, total: { count: 2, currencies: [] } },
      }),
    );
    render(
      <LedgerProvider controller={controller}>
        <CounterpartyDetail />
      </LedgerProvider>,
    );
    expect(screen.getByText("Nina")).toBeDefined();
    expect(screen.getByText("debts only · 1 other rows")).toBeDefined();
  });

  it("routes Settle to a Toast naming it, until E5 merges", () => {
    const controller = controllerOf(
      basePort({
        listCounterparties: () => [NINA_COUNTERPARTY],
        listCounterpartyBalances: () => [NINA_ROW],
      }),
    );
    render(
      <LedgerProvider controller={controller}>
        <CounterpartyDetail />
      </LedgerProvider>,
    );
    fireEvent.click(screen.getByRole("button", { name: "Settle" }));
    expect(
      screen.getByText("Settling isn't built yet — it's coming in a later update."),
    ).toBeDefined();
  });

  it("shows the all-settled empty state, keeping the card, when nothing is open", () => {
    const controller = controllerOf(basePort({ listCounterparties: () => [NINA_COUNTERPARTY] }));
    render(
      <LedgerProvider controller={controller}>
        <CounterpartyDetail />
      </LedgerProvider>,
    );
    expect(screen.getByText("Nina")).toBeDefined();
    expect(screen.getByText("All settled")).toBeDefined();
  });
});

describe("CounterpartyEditor (S15)", () => {
  it("creates a new counterparty from the typed name", () => {
    const createCounterparty = vi.fn<PhoneLedgerPort["createCounterparty"]>(() => undefined);
    const controller = controllerOf(basePort({ createCounterparty }));
    render(
      <LedgerProvider controller={controller}>
        <CounterpartyEditor />
      </LedgerProvider>,
    );
    fireEvent.change(screen.getByLabelText("Name"), { target: { value: "Marek" } });
    fireEvent.click(screen.getByRole("button", { name: "Save" }));
    expect(createCounterparty).toHaveBeenCalledWith(
      expect.objectContaining({ name: "Marek" }),
      expect.anything(),
    );
  });

  it("prefills the existing counterparty's fields in edit mode", () => {
    useLocalSearchParams.mockReturnValue({ id: NINA });
    const controller = controllerOf(basePort({ listCounterparties: () => [NINA_COUNTERPARTY] }));
    render(
      <LedgerProvider controller={controller}>
        <CounterpartyEditor />
      </LedgerProvider>,
    );
    expect(screen.getByDisplayValue("Nina")).toBeDefined();
    expect(screen.getByRole("button", { name: "Archive" })).toBeDefined();
  });

  it("surfaces a near-match warning on blur of the name field", () => {
    const controller = controllerOf(
      basePort({
        listCounterparties: () => [{ ...NINA_COUNTERPARTY, id: MAREK, name: "Ninna" }],
      }),
    );
    render(
      <LedgerProvider controller={controller}>
        <CounterpartyEditor />
      </LedgerProvider>,
    );
    const nameField = screen.getByLabelText("Name");
    fireEvent.change(nameField, { target: { value: "Nina" } });
    fireEvent.blur(nameField);
    expect(screen.getByText("Ninna")).toBeDefined();
    expect(screen.getByText("This is the same one")).toBeDefined();
  });
});
