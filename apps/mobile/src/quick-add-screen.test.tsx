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

function fakeController(
  overrides: {
    createTransaction?: PhoneLedgerPort["createTransaction"];
    capturable?: boolean;
  } = {},
) {
  const port: PhoneLedgerPort = {
    listAccounts: () => [ACCOUNT],
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
});
