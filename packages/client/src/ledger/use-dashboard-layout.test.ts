/** @vitest-environment jsdom */

import { renderHook } from "@testing-library/react";
import { accountingDate } from "@waltning/core/date";
import { id } from "@waltning/core/id";
import * as money from "@waltning/core/money";
import { describe, expect, it, vi } from "vitest";
import { createPhoneLedger, type PhoneLedgerPort } from "./create-phone-ledger.ts";
import { useDashboardLayout } from "./use-dashboard-layout.ts";

function fakeController(readActiveDashboardLayout: PhoneLedgerPort["readActiveDashboardLayout"]) {
  return createPhoneLedger(
    {
      listCurrencySettings: vi.fn(() => []),
      updateCurrency: vi.fn(),
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
      readSpendByCategory: () => [],
      readIncomeVsExpense: () => [],
      readActiveDashboardLayout,
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

describe("useDashboardLayout", () => {
  it("reads the active layout through the controller and memoises on [ledger, revision]", () => {
    const read = vi.fn(() => ({
      id: "layout-1",
      name: "Standing",
      widgets: [
        { id: "w1", kind: "balances", slot: "a1", size: "m" as const, config: {}, sort: 0 },
      ],
    }));
    const ledger = fakeController(read);
    const { result, rerender } = renderHook(() => useDashboardLayout(ledger, 0));

    expect(result.current?.name).toBe("Standing");
    expect(read).toHaveBeenCalledTimes(1);

    rerender();
    expect(read).toHaveBeenCalledTimes(1);
  });

  it("returns null on an empty, never-migrated database", () => {
    const ledger = fakeController(() => null);
    const { result } = renderHook(() => useDashboardLayout(ledger, 0));
    expect(result.current).toBeNull();
  });

  it("re-reads when revision bumps", () => {
    const read = vi.fn(() => null);
    const ledger = fakeController(read);
    const { rerender } = renderHook(
      ({ revision }: { revision: number }) => useDashboardLayout(ledger, revision),
      { initialProps: { revision: 0 } },
    );
    rerender({ revision: 1 });
    expect(read).toHaveBeenCalledTimes(2);
  });
});
