/** @vitest-environment jsdom */

import { act, renderHook } from "@testing-library/react";
import { accountingDate } from "@waltning/core/date";
import { id } from "@waltning/core/id";
import * as money from "@waltning/core/money";
import { currencyCode } from "@waltning/core/money";
import { describe, expect, it, vi } from "vitest";
import { createPhoneLedger, type PhoneSearchTransaction } from "./create-phone-ledger.ts";
import { useTransactionSearch } from "./use-transaction-search.ts";

const PLN = currencyCode("PLN");
const ACCOUNT = id<"accounts">("11111111-1111-4111-8111-111111111111");

function row(n: number): PhoneSearchTransaction {
  return {
    id: id<"transactions">(`00000000-0000-4000-8000-00000000000${n}`),
    date: accountingDate(`2026-08-2${n}`),
    type: "expense",
    payee: `Row ${n}`,
    note: "",
    categoryName: null,
    brandKey: null,
    accountId: ACCOUNT,
    accountName: "Bank A · PLN",
    toAccountId: null,
    toAccountName: null,
    amount: "-10.00000000" as never,
    currency: PLN,
    decimals: 2,
    toAmount: null,
    toCurrency: null,
    toDecimals: null,
    isBusiness: false,
    isCapital: false,
    counterpartyRole: null,
  };
}

/** A fake port whose `searchTransactions` pages a fixed set, one row per call. */
function fakeController() {
  const rows = [row(1), row(2), row(3)];

  return createPhoneLedger(
    {
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
      balanceAsOf: vi.fn(),
      searchTransactions: (filter, cursor) => {
        const start = cursor === undefined ? 0 : rows.findIndex((r) => r.id === cursor.id) + 1;
        const matched =
          filter.text !== undefined
            ? rows.filter((r) => r.payee.toLowerCase().includes(filter.text?.toLowerCase() ?? ""))
            : rows;
        const page = matched.slice(start, start + 1);
        const last = page[page.length - 1];
        return {
          rows: page,
          nextCursor:
            start + 1 < matched.length && last !== undefined
              ? { date: last.date, id: last.id }
              : undefined,
          total: { count: matched.length, currencies: [] },
        };
      },
      createAccount: () => undefined,
      createTransaction: () => undefined,
      createCategory: () => undefined,
      // The port need not do anything real — `createPhoneLedger.categorizeBatch`
      // calls `refresh()` after this returns, which is what notifies every
      // `controller.subscribe` listener, `useTransactionSearch`'s included.
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
      listCurrencySettings: () => [],
      readCoverage: () => [],
      listFxRates: () => [],
      addCurrency: () => undefined,
      archiveCurrency: () => undefined,
      setRateSource: () => undefined,
      setPinned: () => undefined,
      changePivot: () => ({ droppedDates: 0 }),
      setManualRate: () => ({ written: 0, replacedManual: 0 }),
      clearManualRate: () => ({ deleted: 0 }),
      updateCurrency: vi.fn(),
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
        date: accountingDate("2026-08-23"),
        timeZone: "Europe/Warsaw",
        offsetMinutes: 120,
        at: new Date("2026-08-23T10:00:00Z"),
      }),
      id: () => id("22222222-2222-4222-8222-222222222222"),
    },
  );
}

describe("useTransactionSearch", () => {
  it("loads the first page, loads more, and stops when the cursor runs out", () => {
    const controller = fakeController();
    const { result } = renderHook(() => useTransactionSearch(controller, {}));

    expect(result.current.rows.map((r) => r.payee)).toEqual(["Row 1"]);
    expect(result.current.hasMore).toBe(true);

    act(() => result.current.loadMore());
    expect(result.current.rows.map((r) => r.payee)).toEqual(["Row 1", "Row 2"]);
    expect(result.current.hasMore).toBe(true);

    act(() => result.current.loadMore());
    expect(result.current.rows.map((r) => r.payee)).toEqual(["Row 1", "Row 2", "Row 3"]);
    expect(result.current.hasMore).toBe(false);

    // A no-op past the end — never throws, never re-appends.
    act(() => result.current.loadMore());
    expect(result.current.rows).toHaveLength(3);
  });

  it("resets to the first page when the filter changes", () => {
    const controller = fakeController();
    const { result, rerender } = renderHook(
      ({ filter }: { filter: { text?: string } }) => useTransactionSearch(controller, filter),
      { initialProps: { filter: {} } },
    );

    act(() => result.current.loadMore());
    expect(result.current.rows).toHaveLength(2);

    rerender({ filter: { text: "row 2" } });
    expect(result.current.rows.map((r) => r.payee)).toEqual(["Row 2"]);
    expect(result.current.hasMore).toBe(false);
  });

  it("re-fetches the current filter from the first page after a write", () => {
    const controller = fakeController();
    const { result } = renderHook(() => useTransactionSearch(controller, {}));

    act(() => result.current.loadMore());
    expect(result.current.rows).toHaveLength(2);

    act(() => {
      controller.categorizeBatch({
        transactionIds: ["00000000-0000-4000-8000-000000000001"],
        categoryId: "33333333-3333-4333-8333-333333333333",
      });
    });
    // Back to one row — the write reset the page, trading scroll position for
    // freshness (this hook's own doc comment).
    expect(result.current.rows).toHaveLength(1);
  });

  it("is loaded once the first page has resolved", () => {
    const controller = fakeController();
    const { result } = renderHook(() => useTransactionSearch(controller, {}));
    expect(result.current.loaded).toBe(true);
    expect(result.current.error).toBeUndefined();
  });

  it("surfaces a thrown read as an error, and retry clears it", () => {
    let broken = true;
    const controller = createPhoneLedger(
      {
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
        balanceAsOf: vi.fn(),
        searchTransactions: () => {
          if (broken) throw new Error("replica is unreadable");
          return { rows: [], nextCursor: undefined, total: { count: 0, currencies: [] } };
        },
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
        listCurrencySettings: () => [],
        readCoverage: () => [],
        listFxRates: () => [],
        addCurrency: () => undefined,
        archiveCurrency: () => undefined,
        setRateSource: () => undefined,
        setPinned: () => undefined,
        changePivot: () => ({ droppedDates: 0 }),
        setManualRate: () => ({ written: 0, replacedManual: 0 }),
        clearManualRate: () => ({ deleted: 0 }),
        updateCurrency: vi.fn(),
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
          date: accountingDate("2026-08-23"),
          timeZone: "Europe/Warsaw",
          offsetMinutes: 120,
          at: new Date("2026-08-23T10:00:00Z"),
        }),
        id: () => id("22222222-2222-4222-8222-222222222222"),
      },
    );

    const { result } = renderHook(() => useTransactionSearch(controller, {}));
    expect(result.current.error).toBe("replica is unreadable");
    expect(result.current.loaded).toBe(true);

    broken = false;
    act(() => result.current.retry());
    expect(result.current.error).toBeUndefined();
    expect(result.current.rows).toEqual([]);
  });
});
