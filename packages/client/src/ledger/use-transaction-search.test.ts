/** @vitest-environment jsdom */

import { act, renderHook } from "@testing-library/react";
import { accountingDate } from "@waltning/core/date";
import { id } from "@waltning/core/id";
import { currencyCode } from "@waltning/core/money";
import { describe, expect, it } from "vitest";
import { createPhoneLedger, type PhoneSearchTransaction } from "./create-phone-ledger.ts";
import { basePort } from "./test-port.ts";
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
    basePort({
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
    }),
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

/**
 * A port that hands back one row and a cursor, then nothing but the cursor —
 * the shape the drain's own `break` exists for (L2, round 2). Built by
 * wrapping `fakeController`'s controller rather than restating forty port
 * methods: only `searchTransactions` differs.
 */
function emptyPageController(): ReturnType<typeof fakeController> {
  const controller = fakeController();
  return {
    ...controller,
    searchTransactions: (filter, cursor) => {
      const first = controller.searchTransactions(filter);
      if (cursor === undefined) return first;
      return { rows: [], nextCursor: first.nextCursor, total: first.total };
    },
  };
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

  /**
   * C1 (DESK3 review round 1) — the desk table's own load. `fakeController`
   * pages one row at a time, so "every page" here is three calls, and the
   * assertion is that the caller never had to ask for the second and third.
   */
  it("loadAll drains every page in one go, and reports nothing left", () => {
    const controller = fakeController();
    const { result } = renderHook(() => useTransactionSearch(controller, {}, { loadAll: true }));

    expect(result.current.rows.map((r) => r.payee)).toEqual(["Row 1", "Row 2", "Row 3"]);
    expect(result.current.hasMore).toBe(false);
    expect(result.current.capped).toBe(false);
  });

  it("loadAll stops at its cap, with capped true and pages still unread", () => {
    const controller = fakeController();
    const { result } = renderHook(() =>
      useTransactionSearch(controller, {}, { loadAll: true, cap: 2 }),
    );

    expect(result.current.rows.map((r) => r.payee)).toEqual(["Row 1", "Row 2"]);
    // The cursor is still set — the reader is told, not silently truncated.
    expect(result.current.capped).toBe(true);
    expect(result.current.hasMore).toBe(true);
  });

  /**
   * L2 (round 2) — a page that comes back empty while still handing over a
   * cursor is the port disagreeing with itself, not a filter selecting a
   * decade. Both leave a cursor set, so before this they were one flag and
   * one banner: "narrow the filter", which is advice that cannot work here.
   */
  it("a page that returns no rows ends the drain as incomplete, never as capped", () => {
    const controller = emptyPageController();
    const { result } = renderHook(() => useTransactionSearch(controller, {}, { loadAll: true }));

    expect(result.current.rows.map((r) => r.payee)).toEqual(["Row 1"]);
    expect(result.current.incomplete).toBe(true);
    expect(result.current.capped).toBe(false);
    // The cursor is still set, so the phone's own "there is more" is honest.
    expect(result.current.hasMore).toBe(true);
  });

  it("a clean drain is neither capped nor incomplete", () => {
    const controller = fakeController();
    const { result } = renderHook(() => useTransactionSearch(controller, {}, { loadAll: true }));
    expect(result.current.incomplete).toBe(false);
    expect(result.current.capped).toBe(false);
  });

  it("without loadAll the first page is still the only page — the phone list is unchanged", () => {
    const controller = fakeController();
    const { result } = renderHook(() => useTransactionSearch(controller, {}));

    expect(result.current.rows).toHaveLength(1);
    expect(result.current.capped).toBe(false);
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
      basePort({
        searchTransactions: () => {
          if (broken) throw new Error("replica is unreadable");
          return { rows: [], nextCursor: undefined, total: { count: 0, currencies: [] } };
        },
      }),
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
