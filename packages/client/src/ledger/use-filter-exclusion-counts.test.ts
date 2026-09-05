/** @vitest-environment jsdom */

import { renderHook } from "@testing-library/react";
import { accountingDate } from "@waltning/core/date";
import { id } from "@waltning/core/id";
import { describe, expect, it, vi } from "vitest";
import { createPhoneLedger, type PhoneLedgerPort } from "./create-phone-ledger.ts";
import { basePort } from "./test-port.ts";
import { activeFilterDimensions, useFilterExclusionCounts } from "./use-filter-exclusion-counts.ts";
import {
  EMPTY_LEDGER_FILTER,
  type LedgerFilterState,
  ledgerFilterDraft,
} from "./use-ledger-filters.ts";

/**
 * The hook's own wiring — a count per active control, subtracted from the
 * count on screen — is proven end to end against a real controller in
 * `apps/mobile/src/ledger-screen.desk.test.tsx` ("an active filter says how
 * many rows it excludes"), because what matters there is that the number
 * reaches the rail. What is worth stating here is the decision that governs
 * *how many queries run at all*: an inactive control excludes nothing by
 * definition and must cost nothing.
 *
 * The two properties round 3 added are here for the same reason — they are
 * about the queries rather than about the number that comes out. **Every one
 * of them is `countOnly`** (M3): the port answers those with an SQL
 * `COUNT(*)` instead of folding every matching row through `decimal.js` for
 * currency sums nothing renders, and the date range's own query is a query
 * over the whole ledger. **And one round per filter change, never two**
 * (M2): the counts are subtractions from a count on screen, so they wait
 * until the search has actually answered the filter they are computed from.
 */
describe("activeFilterDimensions", () => {
  it("an empty filter is no queries at all", () => {
    expect(activeFilterDimensions(EMPTY_LEDGER_FILTER)).toEqual([]);
  });

  it("whitespace is not a text filter", () => {
    expect(activeFilterDimensions({ ...EMPTY_LEDGER_FILTER, text: "   " })).toEqual([]);
    expect(activeFilterDimensions({ ...EMPTY_LEDGER_FILTER, text: "bakery" })).toEqual(["text"]);
  });

  it("names every dimension §4 lists, once each", () => {
    expect(
      activeFilterDimensions({
        text: "bakery",
        accountIds: ["acc-1"],
        categoryIds: ["cat-1"],
        scope: "business",
        currency: "PLN",
        counterpartyId: "cp-1",
        from: "2026-09-01",
        to: "2026-09-30",
      }),
    ).toEqual([
      "text",
      "accountIds",
      "categoryIds",
      "scope",
      "currency",
      "counterpartyId",
      "dateRange",
    ]);
  });

  /** `from` and `to` are one control on both surfaces, so they are one query. */
  it("half a date range is still one dimension", () => {
    expect(activeFilterDimensions({ ...EMPTY_LEDGER_FILTER, from: "2026-09-01" })).toEqual([
      "dateRange",
    ]);
    expect(activeFilterDimensions({ ...EMPTY_LEDGER_FILTER, to: "2026-09-30" })).toEqual([
      "dateRange",
    ]);
  });
});

const EMPTY_PAGE = {
  rows: [],
  nextCursor: undefined,
  total: { count: 0, currencies: [] },
} as const;

/** Everything active at once — seven dimensions, one query each. */
const EVERY_DIMENSION: LedgerFilterState = {
  text: "bakery",
  accountIds: ["11111111-1111-4111-8111-111111111111"],
  categoryIds: ["66666666-6666-4666-8666-666666666666"],
  scope: "business",
  currency: "PLN",
  counterpartyId: "77777777-7777-4777-8777-777777777777",
  from: "2026-09-01",
  to: "2026-09-30",
};

function fakeController(searchTransactions: PhoneLedgerPort["searchTransactions"]) {
  return createPhoneLedger(basePort({ searchTransactions }), {
    capture: () => ({
      date: accountingDate("2026-09-05"),
      timeZone: "Europe/Warsaw",
      offsetMinutes: 120,
      at: new Date("2026-09-05T10:00:00Z"),
    }),
    id: () => id("22222222-2222-4222-8222-222222222222"),
  });
}

/** The key the search publishes as `answersTo` for a given filter state. */
function answersTo(filter: LedgerFilterState) {
  return JSON.stringify(ledgerFilterDraft(filter));
}

describe("useFilterExclusionCounts", () => {
  it("asks for a count and nothing else — one countOnly query per active dimension", () => {
    const search = vi.fn<PhoneLedgerPort["searchTransactions"]>(() => EMPTY_PAGE);
    const controller = fakeController(search);
    search.mockClear(); // the constructor's own `refresh()` makes none, but be explicit

    renderHook(() =>
      useFilterExclusionCounts(controller, EVERY_DIMENSION, {
        count: 3,
        answersTo: answersTo(EVERY_DIMENSION),
      }),
    );

    expect(search).toHaveBeenCalledTimes(7);
    // Every one of them, not most: a single full-fat query here is a fold of
    // every matching row for a figure that is thrown away.
    for (const call of search.mock.calls) {
      expect(call[2]).toEqual({ countOnly: true });
      // A count has no page, so a cursor would be meaningless.
      expect(call[1]).toBeUndefined();
    }
  });

  it("an inactive dimension costs no query at all", () => {
    const search = vi.fn<PhoneLedgerPort["searchTransactions"]>(() => EMPTY_PAGE);
    const controller = fakeController(search);
    search.mockClear();

    const filter = { ...EMPTY_LEDGER_FILTER, scope: "mine" as const };
    renderHook(() =>
      useFilterExclusionCounts(controller, filter, { count: 1, answersTo: answersTo(filter) }),
    );

    expect(search).toHaveBeenCalledTimes(1);
  });

  /**
   * M2 (round 3) — the count on screen belongs to whichever filter the
   * search last answered, and for one commit after a change that is the
   * previous one. Subtracting it would publish a wrong number and pay seven
   * queries to produce it.
   */
  it("runs nothing while the count on screen answers to a different filter", () => {
    const search = vi.fn<PhoneLedgerPort["searchTransactions"]>(() => EMPTY_PAGE);
    const controller = fakeController(search);
    search.mockClear();

    const { result, rerender } = renderHook(
      ({ matchedAnswersTo }: { matchedAnswersTo: string }) =>
        useFilterExclusionCounts(controller, EVERY_DIMENSION, {
          count: 3,
          answersTo: matchedAnswersTo,
        }),
      { initialProps: { matchedAnswersTo: answersTo(EMPTY_LEDGER_FILTER) } },
    );

    expect(search).not.toHaveBeenCalled();
    expect(result.current).toEqual({});

    // The search catches up: same filter, and now the counts are true of it.
    rerender({ matchedAnswersTo: answersTo(EVERY_DIMENSION) });
    expect(search).toHaveBeenCalledTimes(7);
  });

  /** The arithmetic itself: the wider count, minus what is already on screen. */
  it("subtracts the count on screen from the count without that one clause", () => {
    const filter = { ...EMPTY_LEDGER_FILTER, currency: "PLN" };
    const controller = fakeController(() => ({
      rows: [],
      nextCursor: undefined,
      total: { count: 42, currencies: [] },
    }));

    const { result } = renderHook(() =>
      useFilterExclusionCounts(controller, filter, { count: 12, answersTo: answersTo(filter) }),
    );

    expect(result.current).toEqual({ currency: 30 });
  });

  /** A write landing mid-flight is the one way the wider count comes back smaller. */
  it("never reports a negative exclusion", () => {
    const filter = { ...EMPTY_LEDGER_FILTER, currency: "PLN" };
    const controller = fakeController(() => ({
      rows: [],
      nextCursor: undefined,
      total: { count: 2, currencies: [] },
    }));

    const { result } = renderHook(() =>
      useFilterExclusionCounts(controller, filter, { count: 5, answersTo: answersTo(filter) }),
    );

    expect(result.current).toEqual({ currency: 0 });
  });
});
