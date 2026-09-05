/** @vitest-environment jsdom */

import { renderHook } from "@testing-library/react";
import { accountingDate } from "@waltning/core/date";
import { id } from "@waltning/core/id";
import * as money from "@waltning/core/money";
import { describe, expect, it, vi } from "vitest";
import { createPhoneLedger, type PhoneLedgerPort } from "./create-phone-ledger.ts";
import { useCategoryReferenceCounts } from "./use-category-reference-counts.ts";

function fakeController(
  readCategoryReferenceCounts: PhoneLedgerPort["readCategoryReferenceCounts"],
) {
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
      readCategoryReferenceCounts,
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

describe("useCategoryReferenceCounts (M2)", () => {
  it("reads the counts once per category/revision, not once per render", () => {
    const read = vi.fn(() => ({ transactions: 3, lines: 5, rules: 1 }));
    const controller = fakeController(read);

    const { result, rerender } = renderHook(
      ({ revision }) => useCategoryReferenceCounts(controller, "groceries", revision),
      { initialProps: { revision: controller.getSnapshot().revision } },
    );

    expect(read).toHaveBeenCalledTimes(1);
    const first = result.current;

    // A re-render with the same revision (a search keystroke, a toggled
    // section) must not re-run the read — the whole point of the memo.
    rerender({ revision: controller.getSnapshot().revision });
    expect(read).toHaveBeenCalledTimes(1);
    expect(result.current).toBe(first);

    // A bumped revision (a write elsewhere) is the one thing that reruns it.
    rerender({ revision: controller.getSnapshot().revision + 1 });
    expect(read).toHaveBeenCalledTimes(2);
  });

  it("returns zero counts, with no read call, for an undefined category", () => {
    const read = vi.fn(() => ({ transactions: 3, lines: 5, rules: 1 }));
    const controller = fakeController(read);

    const { result } = renderHook(() => useCategoryReferenceCounts(controller, undefined, 1));

    expect(read).not.toHaveBeenCalled();
    expect(result.current).toEqual({ transactions: 0, lines: 0, rules: 0 });
  });
});
