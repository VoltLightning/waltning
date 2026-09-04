/**
 * @vitest-environment jsdom
 *
 * D4b's own phone path — S05 §3 mobile: `Keypad` taps fold onto a raw
 * string, an account chip picks against the ledger's own accounts, Save
 * reaches `create_transaction` with the parsed amount. `screens.test.tsx`
 * keeps the one cross-screen smoke test plus the desk fallback; this file is
 * the phone path's own coverage, the shape `account-editor-screen.test.tsx`
 * already uses for a fixture no other screen shares.
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

import QuickAdd from "./quick-add-screen";

const PLN = currencyCode("PLN");
const ACCOUNT = {
  id: id<"accounts">("11111111-1111-4111-8111-111111111111"),
  name: "Cash · PLN",
  kind: "cash" as const,
  currency: PLN,
  decimals: 2,
  balance: toMoney("0"),
  groupId: null,
  ownership: "own" as const,
  isBusiness: false,
  archived: false,
  expectedBalance: null,
  openingBalance: toMoney("0"),
  openingDate: null,
  memo: "",
  version: 1,
};

const SHARED_ACCOUNT = {
  ...ACCOUNT,
  id: id<"accounts">("33333333-3333-4333-8333-333333333333"),
  name: "Joint · PLN",
  ownership: "shared" as const,
};

const COUNTERPARTY = {
  id: id<"counterparties">("44444444-4444-4444-8444-444444444444"),
  name: "Costa",
  kind: "person" as const,
  settlementCurrency: null,
  archived: false,
};

function fakeController(
  overrides: {
    createTransaction?: PhoneLedgerPort["createTransaction"];
    capturable?: boolean;
    accounts?: readonly PhoneAccount[];
    counterparties?: PhoneLedgerPort["listCounterparties"];
  } = {},
) {
  const port: PhoneLedgerPort = {
    listAccounts: () => overrides.accounts ?? [ACCOUNT],
    listCurrencies: () => [
      {
        code: PLN,
        name: "Polish Złoty",
        symbol: "zł",
        decimals: 2,
        capturable: overrides.capturable ?? true,
      },
    ],
    listGroups: () => [],
    listRecent: () => [],
    listCategories: () => [],
    listCategoryTree: () => [],
    listCounterparties: overrides.counterparties ?? (() => []),
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
    readCoverage: vi.fn(() => []),
    listFxRates: vi.fn(() => []),
    addCurrency: vi.fn(),
    archiveCurrency: vi.fn(),
    setRateSource: vi.fn(),
    setPinned: vi.fn(),
    changePivot: vi.fn(),
    setManualRate: vi.fn(() => ({ written: 0, replacedManual: 0 })),
    clearManualRate: vi.fn(() => ({ deleted: 0 })),
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
    reset: vi.fn(),
  };
  return createPhoneLedger(port, {
    capture: () => ({
      date: accountingDate("2026-09-03"),
      timeZone: "Europe/Warsaw",
      offsetMinutes: 120,
      at: new Date("2026-09-03T10:00:00Z"),
    }),
    id: () => id("22222222-2222-4222-8222-222222222222"),
  });
}

function withLedger(overrides: Parameters<typeof fakeController>[0] = {}) {
  return render(
    <LedgerProvider controller={fakeController(overrides)}>
      <QuickAdd />
    </LedgerProvider>,
  );
}

/** Keypad's own glyphs — `.` is English's decimal mark, mapped to the canonical `,` key. */
function tapKeys(...glyphs: readonly string[]) {
  for (const glyph of glyphs) fireEvent.click(screen.getByRole("button", { name: glyph }));
}

function pickCashAccount() {
  fireEvent.click(screen.getByRole("button", { name: "Account" }));
  fireEvent.click(screen.getByRole("radio", { name: "Account: Cash · PLN" }));
}

function pickSharedAccount() {
  fireEvent.click(screen.getByRole("button", { name: /^Account/ }));
  fireEvent.click(screen.getByRole("radio", { name: "Account: Joint · PLN" }));
}

beforeEach(() => {
  router.push.mockClear();
  router.back.mockClear();
  router.dismissTo.mockClear();
  useLocalSearchParams.mockReturnValue({});
});

describe("QuickAdd — the phone path (Dock + QuickAddComposer)", () => {
  it("disables Save until an amount and an account are both present (S05 §9.2)", () => {
    withLedger();
    expect(screen.getByRole("button", { name: "Save" })).toHaveProperty("disabled", true);

    tapKeys("4", "8", ".", "9", "0");
    expect(screen.getByRole("button", { name: "Save" })).toHaveProperty("disabled", true);

    pickCashAccount();
    expect(screen.getByRole("button", { name: "Save" })).toHaveProperty("disabled", false);
  });

  /**
   * §6.7's guarantee, held across a mid-draft account switch — the finding
   * this covers: `composerIsBusiness` is state this screen owns, and it does
   * not clear itself just because the account chip changed underneath it.
   */
  it("resets isBusiness when the account switches to a shared one (SPEC.md §6.7)", () => {
    const createTransaction = vi.fn();
    withLedger({ createTransaction, accounts: [ACCOUNT, SHARED_ACCOUNT] });

    tapKeys("4", "8", ".", "9", "0");
    pickCashAccount();
    fireEvent.click(screen.getByText("Mine"));
    fireEvent.click(screen.getByRole("tab", { name: "Business" }));
    expect(screen.getByText("Business")).toBeDefined();

    pickSharedAccount();
    fireEvent.click(screen.getByRole("button", { name: "Save" }));

    expect(createTransaction).toHaveBeenCalledOnce();
    expect(createTransaction.mock.calls[0]?.[0]).toMatchObject({
      accountId: SHARED_ACCOUNT.id,
      isBusiness: false,
    });
  });

  /**
   * §6.6, never defaulted — `createTransactionInput`'s own refine reports the
   * mismatch under `counterpartyRole`, which `QuickAddComposer` did not use to
   * read errors before this fix. Save must not let the draft reach the write
   * at all while the role is unresolved, not only render the refusal after.
   */
  it("disables Save while a counterparty is picked with no role yet (SPEC.md §6.6)", () => {
    const createTransaction = vi.fn();
    withLedger({ createTransaction, counterparties: () => [COUNTERPARTY] });

    tapKeys("4", "8", ".", "9", "0");
    pickCashAccount();
    expect(screen.getByRole("button", { name: "Save" })).toHaveProperty("disabled", false);

    fireEvent.click(screen.getByRole("button", { name: "+ Person" }));
    fireEvent.click(screen.getByRole("button", { name: "Counterparty" }));
    fireEvent.click(screen.getByRole("radio", { name: "Costa" }));

    expect(screen.getByRole("button", { name: "Save" })).toHaveProperty("disabled", true);
    expect(screen.getByText("Costa · role?")).toBeDefined();
    expect(createTransaction).not.toHaveBeenCalled();
  });

  it("lands a refusal under the chip it names, without discarding the draft", () => {
    // An uncapturable currency is a refusal the client controller itself
    // raises, before the write — no port throw to simulate.
    withLedger({ capturable: false });

    tapKeys("4", "8", ".", "9", "0");
    pickCashAccount();
    fireEvent.click(screen.getByRole("button", { name: "Save" }));

    expect(
      screen.getByText("PLN needs an exchange rate before a transaction can be recorded in it."),
    ).toBeDefined();
    expect(router.dismissTo).not.toHaveBeenCalled();
    // The typed amount survives the refusal — nothing here re-empties the draft.
    expect(screen.getByText("48.90")).toBeDefined();
  });

  /**
   * Last in the file, deliberately: a successful save writes the real device
   * clock into `lastCapture` (`platform.ts`'s own singleton, shared for the
   * rest of this module's life), which every other test's fixed mock "now"
   * would then treat as inside the four-hour window — `now - at` goes
   * negative when `at` is later than the mocked `now`, and the guard is
   * `>=`, not "is this actually in the past". Real behaviour is unaffected
   * (a real device's clock never runs behind its own last save); only the
   * fixture's fixed date can be "before" a real `Date.now()`.
   */
  it("saves the parsed amount against the picked account, then returns to Today", () => {
    const createTransaction = vi.fn();
    withLedger({ createTransaction });

    tapKeys("4", "8", ".", "9", "0");
    pickCashAccount();
    fireEvent.click(screen.getByRole("button", { name: "Save" }));

    expect(createTransaction).toHaveBeenCalledOnce();
    expect(createTransaction.mock.calls[0]?.[0]).toMatchObject({
      // `numeric(20,8)`'s own shape (`SPEC.md` §7.1) — `money.toMoney` pads
      // the parsed "48.90" out to eight fraction digits.
      amountOriginal: "48.90000000",
      accountId: ACCOUNT.id,
      type: "expense",
    });
    expect(router.dismissTo).toHaveBeenCalledWith("/");
  });
});
