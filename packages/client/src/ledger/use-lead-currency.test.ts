/**
 * @vitest-environment jsdom
 *
 * `use-lead-currency.ts` — which subtotal a shell hero leads with, tested
 * where the decision is made rather than through a rendered band. The rule has
 * three branches and only one of them is the ordinary case, so a shell test
 * covers whichever branch its fixture happens to hit and no more.
 */

import { renderHook } from "@testing-library/react";
import { accountingDate } from "@waltning/core/date";
import { id } from "@waltning/core/id";
import * as money from "@waltning/core/money";
import { currencyCode } from "@waltning/core/money";
import { describe, expect, it, vi } from "vitest";
import {
  createPhoneLedger,
  type PhoneAccount,
  type PhoneLedgerPort,
} from "./create-phone-ledger.ts";
import { useLeadCurrency } from "./use-lead-currency.ts";

const CHF = currencyCode("CHF");
const EUR = currencyCode("EUR");
const PLN = currencyCode("PLN");

function fakeController(listAccounts: PhoneLedgerPort["listAccounts"]) {
  return createPhoneLedger(
    {
      listCurrencySettings: vi.fn(() => []),
      updateCurrency: vi.fn(),
      listAccounts,
      listCurrencies: () => [],
      listGroups: () => [],
      listRecent: () => [],
      listCategories: () => [],
      listCategoryTree: () => [],
      listCounterparties: () => [],
      listPayeeHistory: () => [],
      listNetWorth: () => [],
      readPeriodSpend: () => [],
      readSpendByCategory: () => [],
      readIncomeVsExpense: () => [],
      readActiveDashboardLayout: () => null,
      listUnsettledClearing: () => [],
      listCounterpartyBalances: () => [],
      listCounterpartyMerges: () => [],
      listDistinctCounterpartyPairs: () => [],
      balanceAsOf: () => money.toMoney("0"),
      searchTransactions: () => ({
        rows: [],
        nextCursor: undefined,
        total: { count: 0, currencies: [] },
      }),
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
      readCrossRate: () => null,
      readCoverage: () => [],
      listFxRates: () => [],
      addCurrency: () => undefined,
      archiveCurrency: () => undefined,
      setRateSource: () => undefined,
      setPinned: () => undefined,
      changePivot: () => ({ droppedDates: 0 }),
      setManualRate: () => ({ written: 0, replacedManual: 0 }),
      clearManualRate: () => ({ deleted: 0 }),
      createCounterparty: () => undefined,
      updateCounterparty: () => undefined,
      mergeCounterparties: () => undefined,
      unmergeCounterparties: () => undefined,
      recordDistinctCounterparties: () => undefined,
      settleDebt: () => ({ residual: money.toMoney("0"), overSettled: false }),
      listFullCategoryTree: () => [],
      listCategoryUsage: () => new Map(),
      readCategoryReferenceCounts: () => ({ transactions: 0, lines: 0, rules: 0 }),
      renameCategory: () => undefined,
      reparentCategory: () => undefined,
      convertLeafGroup: () => undefined,
      mergeCategories: () => undefined,
      archiveCategory: () => undefined,
      reset: () => undefined,
    },
    {
      capture: () => ({
        date: accountingDate("2026-09-04"),
        timeZone: "Europe/Warsaw",
        offsetMinutes: 120,
        at: new Date("2026-09-04T10:00:00Z"),
      }),
      id: () => id("22222222-2222-4222-8222-222222222222"),
    },
  );
}

function account(overrides: Partial<PhoneAccount>): PhoneAccount {
  return {
    id: id<"accounts">("55555555-5555-4555-8555-555555555555"),
    name: "Bank A · PLN",
    kind: "bank",
    currency: PLN,
    decimals: 2,
    balance: money.toMoney("100.00"),
    groupId: null,
    ownership: "own",
    isBusiness: false,
    archived: false,
    expectedBalance: null,
    openingBalance: money.toMoney("0"),
    openingDate: null,
    memo: "",
    version: 1,
    ...overrides,
  };
}

describe("useLeadCurrency", () => {
  it("leads with the display currency when the ledger holds it", () => {
    const ledger = fakeController(() => [
      account({ currency: CHF, balance: money.toMoney("9000.00") }),
      account({
        id: id<"accounts">("66666666-6666-4666-8666-666666666666"),
        name: "Bank B · EUR",
        currency: EUR,
        balance: money.toMoney("40.00"),
      }),
    ]);
    const { result } = renderHook(() => useLeadCurrency(ledger, EUR));

    expect(result.current).toEqual({
      entry: { currency: EUR, decimals: 2, balance: money.toMoney("40.00") },
      fallback: false,
    });
  });

  it("falls back to the largest holding by absolute total, not the first account's", () => {
    const ledger = fakeController(() => [
      account({ currency: CHF, balance: money.toMoney("40.00") }),
      account({
        id: id<"accounts">("66666666-6666-4666-8666-666666666666"),
        name: "Card B · EUR",
        kind: "card",
        currency: EUR,
        balance: money.toMoney("-9000.00"),
      }),
    ]);
    const { result } = renderHook(() => useLeadCurrency(ledger, PLN));

    expect(result.current).toEqual({
      entry: { currency: EUR, decimals: 2, balance: money.toMoney("-9000.00") },
      fallback: true,
      missing: PLN,
    });
  });

  it("keeps ledger order when two holdings are the same size", () => {
    const ledger = fakeController(() => [
      account({ currency: CHF, balance: money.toMoney("500.00") }),
      account({
        id: id<"accounts">("66666666-6666-4666-8666-666666666666"),
        name: "Bank B · EUR",
        currency: EUR,
        balance: money.toMoney("-500.00"),
      }),
    ]);
    const { result } = renderHook(() => useLeadCurrency(ledger, PLN));

    expect(result.current).toMatchObject({ entry: { currency: CHF }, fallback: true });
  });

  it("is null before the first account — nothing to fall back to", () => {
    const ledger = fakeController(() => []);
    const { result } = renderHook(() => useLeadCurrency(ledger, PLN));

    expect(result.current).toBeNull();
  });
});
