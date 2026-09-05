/** @vitest-environment jsdom */

import { renderHook } from "@testing-library/react";
import { accountingDate } from "@waltning/core/date";
import { id } from "@waltning/core/id";
import * as money from "@waltning/core/money";
import { describe, expect, it, vi } from "vitest";
import { createPhoneLedger, type PhoneLedgerPort } from "./create-phone-ledger.ts";
import { useCounterpartyHistory } from "./use-counterparty-history.ts";

const EMPTY_PAGE = {
  rows: [],
  nextCursor: undefined,
  total: { count: 0, currencies: [] },
} as const;

function fakeController(searchTransactions: PhoneLedgerPort["searchTransactions"]) {
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
      listUnsettledClearing: () => [],
      listCounterpartyBalances: () => [],
      listCounterpartyMerges: () => [],
      listDistinctCounterpartyPairs: () => [],
      balanceAsOf: () => money.toMoney("0"),
      searchTransactions,
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

describe("useCounterpartyHistory (M2)", () => {
  it("reads the two histories once per counterparty/revision, not once per render", () => {
    const search = vi.fn(() => EMPTY_PAGE);
    const controller = fakeController(search);
    search.mockClear(); // drop the constructor's own `refresh()` — this hook makes no calls of its own yet.

    const { result, rerender } = renderHook(
      ({ revision }) => useCounterpartyHistory(controller, "nina", revision),
      { initialProps: { revision: controller.getSnapshot().revision } },
    );

    expect(search).toHaveBeenCalledTimes(2); // debt-only, then every-role.
    const first = result.current;

    // A re-render with the same revision (a keypad digit, a toggled section)
    // must not re-run either search — the whole point of the memo.
    rerender({ revision: controller.getSnapshot().revision });
    expect(search).toHaveBeenCalledTimes(2);
    expect(result.current).toBe(first);

    // A bumped revision (a write elsewhere) is the one thing that reruns it.
    rerender({ revision: controller.getSnapshot().revision + 1 });
    expect(search).toHaveBeenCalledTimes(4);
  });

  it("returns empty pages, with no search call, for an undefined counterparty", () => {
    const search = vi.fn(() => EMPTY_PAGE);
    const controller = fakeController(search);
    search.mockClear();

    const { result } = renderHook(() => useCounterpartyHistory(controller, undefined, 1));

    expect(search).not.toHaveBeenCalled();
    expect(result.current.debtHistory.rows).toEqual([]);
    expect(result.current.everyHistory.rows).toEqual([]);
  });
});
