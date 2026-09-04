/**
 * @vitest-environment jsdom
 *
 * S31 · Transfer — the phone path. Same harness shape as
 * `quick-add-screen.test.tsx`: a real `createPhoneLedger` over a fake port,
 * rendered under `<LedgerProvider>`, driven through `fireEvent`.
 */

import { fireEvent, render, screen } from "@testing-library/react";
import {
  createPhoneLedger,
  type PhoneAccount,
  type PhoneLedgerPort,
} from "@waltning/client/ledger/create-phone-ledger";
import { LedgerProvider } from "@waltning/client/ledger/ledger-provider";
import { accountingDate } from "@waltning/core/date";
import { id } from "@waltning/core/id";
import { currencyCode, pivotPerUnit, toMoney } from "@waltning/core/money";
import { beforeEach, describe, expect, it, vi } from "vitest";

const router = { push: vi.fn(), back: vi.fn(), dismissTo: vi.fn() };
const useLocalSearchParams = vi.fn(() => ({}));

vi.mock("expo-router", () => ({
  get router() {
    return router;
  },
  useLocalSearchParams: () => useLocalSearchParams(),
}));

import Transfer from "./transfer-screen";

const USD = currencyCode("USD");
const PLN = currencyCode("PLN");

const HOUSEHOLD: PhoneAccount = {
  id: id<"accounts">("11111111-1111-4111-8111-111111111111"),
  name: "Household · USD",
  kind: "bank",
  currency: USD,
  decimals: 2,
  balance: toMoney("0"),
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

const CASH: PhoneAccount = {
  ...HOUSEHOLD,
  id: id<"accounts">("22222222-2222-4222-8222-222222222222"),
  name: "Cash · PLN",
  kind: "cash",
  currency: PLN,
};

function fakeController(
  overrides: {
    createTransaction?: PhoneLedgerPort["createTransaction"];
    accounts?: readonly PhoneAccount[];
    capturableUsd?: boolean;
  } = {},
) {
  const port: PhoneLedgerPort = {
    listAccounts: () => overrides.accounts ?? [HOUSEHOLD, CASH],
    listCurrencies: () => [
      {
        code: USD,
        name: "US Dollar",
        symbol: "$",
        decimals: 2,
        capturable: overrides.capturableUsd ?? true,
        isPivot: true,
      },
      {
        code: PLN,
        name: "Polish Złoty",
        symbol: "zł",
        decimals: 2,
        capturable: true,
        isPivot: false,
      },
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
    balanceAsOf: () => toMoney("0"),
    createAccount: vi.fn(),
    createTransaction: overrides.createTransaction ?? vi.fn(),
    createCategory: vi.fn(),
    updateAccount: vi.fn(),
    archiveAccount: vi.fn(),
    reconcileAccount: vi.fn(),
    createGroup: vi.fn(),
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
    readRate: vi.fn(() => null),
    // S31 §9's own worked example: 3.8100 PLN per USD, `readCrossRate`'s
    // pivot-per-unit direction — multiply the USD leg by this to reach PLN.
    readCrossRate: vi.fn(({ from, to }) =>
      from === USD && to === PLN
        ? {
            rate: pivotPerUnit("3.8100"),
            source: "nbp",
            asOf: accountingDate("2026-08-12"),
            carriedDays: 0,
          }
        : null,
    ),
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
    listCounterpartyBalances: vi.fn(() => []),
    listFullCategoryTree: vi.fn(() => []),
    listCategoryUsage: vi.fn(() => new Map()),
    readCategoryReferenceCounts: vi.fn(() => ({ transactions: 0, lines: 0, rules: 0 })),
    renameCategory: vi.fn(),
    reparentCategory: vi.fn(),
    convertLeafGroup: vi.fn(),
    mergeCategories: vi.fn(),
    archiveCategory: vi.fn(),
<<<<<<< HEAD
    listCurrencySettings: vi.fn(() => []),
=======
    listCounterpartyMerges: vi.fn(() => []),
    listDistinctCounterpartyPairs: vi.fn(() => []),
>>>>>>> ae12a67 (Rebase E4 onto main: route parser merged with E5's type, i18n unions, fixtures completed)
    reset: vi.fn(),
  };
  return createPhoneLedger(port, {
    capture: () => ({
      date: accountingDate("2026-08-12"),
      timeZone: "Europe/Warsaw",
      offsetMinutes: 120,
      at: new Date("2026-08-12T10:00:00Z"),
    }),
    id: () => id("33333333-3333-4333-8333-333333333333"),
  });
}

function withLedger(overrides: Parameters<typeof fakeController>[0] = {}) {
  return render(
    <LedgerProvider controller={fakeController(overrides)}>
      <Transfer />
    </LedgerProvider>,
  );
}

/** Keypad's own glyphs — `.` is English's decimal mark, mapped to the canonical `,` key. */
function tapKeys(...glyphs: readonly string[]) {
  for (const glyph of glyphs) fireEvent.click(screen.getByRole("button", { name: glyph }));
}

/**
 * `AccountPicker` (`accounts/`) — a tile's own accessible name is the
 * account's name alone, matching every other call site's tiles
 * (`account-picker.test.tsx`), not the `Chip`'s "Account: …" convention its
 * own trigger button still carries before a pick.
 */
function pickFrom(name: string) {
  fireEvent.click(screen.getByRole("button", { name: /^From/ }));
  fireEvent.click(screen.getByRole("radio", { name }));
}

function pickTo(name: string) {
  fireEvent.click(screen.getByRole("button", { name: /^To/ }));
  fireEvent.click(screen.getByRole("radio", { name }));
}

beforeEach(() => {
  router.push.mockClear();
  router.back.mockClear();
  router.dismissTo.mockClear();
  useLocalSearchParams.mockReturnValue({});
});

describe("Transfer — the phone path", () => {
  it("refuses the same account both sides, inline, before Save", () => {
    withLedger();
    pickFrom("Household · USD");
    pickTo("Household · USD");

    expect(screen.getByText("A transfer needs two different accounts.")).toBeDefined();
    expect(screen.getByRole("button", { name: "Save" })).toHaveProperty("disabled", true);
  });

  /**
   * S31 §9's own worked example: 150 USD → 565.20 PLN at reference 3.8100 —
   * the destination is pre-filled from the reference (571.50) and then
   * edited to the bank's own figure, the way §3 says a person actually uses
   * this screen. The margin renders at 6.30 zł-equivalent (`money.margin`'s
   * own worked arithmetic, converted into the destination currency).
   */
  it("shows the bank's margin once the destination is typed over the reference prefill", () => {
    const createTransaction = vi.fn();
    withLedger({ createTransaction });

    pickFrom("Household · USD");
    pickTo("Cash · PLN");

    fireEvent.click(screen.getByRole("button", { name: "Amount: 0" }));
    tapKeys("1", "5", "0");

    // Pre-filled from the reference: 150 × 3.8100 = 571.50.
    expect(screen.getByText("571.50")).toBeDefined();

    fireEvent.click(screen.getByRole("button", { name: "Destination amount: 571.50" }));
    tapKeys("Delete", "Delete", "Delete", "Delete", "Delete", "Delete");
    tapKeys("5", "6", "5", ".", "2", "0");
    expect(screen.getByText("565.20")).toBeDefined();

    // §4a: margin_pivot = 150 − 565.20 ÷ 3.8100 ≈ 1.6535 USD ≈ 6.30 PLN.
    // With no fee typed, the footer's Total repeats the same figure.
    expect(screen.getAllByText((_, element) => element?.textContent === "6.30 PLN")).toHaveLength(
      2,
    );

    fireEvent.click(screen.getByRole("button", { name: "Save" }));

    expect(createTransaction).toHaveBeenCalledOnce();
    const draft = createTransaction.mock.calls[0]?.[0];
    expect(draft).toMatchObject({
      type: "transfer",
      accountId: HOUSEHOLD.id,
      amountOriginal: "150.00000000",
      currency: USD,
      toAccountId: CASH.id,
      toAmount: "565.20000000",
      toCurrency: PLN,
    });
    expect(draft?.toFxRate).toBeUndefined();
    expect(router.dismissTo).toHaveBeenCalledWith("/");
  });

  /**
   * `H` — the controller refuses `create_transaction` on `accountId` (the
   * *from* leg) before the write when the account holds no rate (§14.6);
   * Save must not be tappable while that refusal is already knowable.
   */
  it("disables Save and shows the needsRate caption when the From account can't be captured (SPEC.md §14.6)", () => {
    withLedger({ capturableUsd: false });
    pickFrom("Household · USD");
    pickTo("Cash · PLN");

    expect(
      screen.getByText("USD needs an exchange rate before a transaction can be recorded in it."),
    ).toBeDefined();
    expect(screen.getByRole("button", { name: "Save" })).toHaveProperty("disabled", true);
  });

  it("collapses to one amount for a same-currency transfer", () => {
    const secondAccount: PhoneAccount = {
      ...CASH,
      id: id<"accounts">("55555555-5555-4555-8555-555555555555"),
      name: "Savings · PLN",
    };
    withLedger({ accounts: [CASH, secondAccount] });
    pickFrom("Cash · PLN");
    pickTo("Savings · PLN");

    expect(screen.queryByRole("button", { name: /^Destination amount/ })).toBeNull();
  });
});
