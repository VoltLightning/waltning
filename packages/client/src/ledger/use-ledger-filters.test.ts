/** @vitest-environment jsdom */

import { act, renderHook } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { TEXT_FILTER_DEBOUNCE_MS } from "../query/use-debounced-value.ts";
import { EMPTY_LEDGER_FILTER, useLedgerFilters } from "./use-ledger-filters.ts";

describe("useLedgerFilters", () => {
  it("starts empty, with no active filter", () => {
    const { result } = renderHook(() => useLedgerFilters());
    expect(result.current.filter).toEqual(EMPTY_LEDGER_FILTER);
    expect(result.current.hasActiveFilter).toBe(false);
  });

  it("seeds from an initial partial — the account chip a caller arrives with", () => {
    const { result } = renderHook(() => useLedgerFilters({ accountIds: ["acc-1"] }));
    expect(result.current.filter.accountIds).toEqual(["acc-1"]);
    expect(result.current.hasActiveFilter).toBe(true);
  });

  it("setScope, setAccountIds and setCategoryIds each mark the filter active", () => {
    const { result } = renderHook(() => useLedgerFilters());

    act(() => result.current.setScope("business"));
    expect(result.current.hasActiveFilter).toBe(true);

    act(() => result.current.setScope("all"));
    expect(result.current.hasActiveFilter).toBe(false);

    act(() => result.current.setCategoryIds(["cat-1"]));
    expect(result.current.hasActiveFilter).toBe(true);
  });

  it("removeAccount and removeCategory drop just the one id named", () => {
    const { result } = renderHook(() =>
      useLedgerFilters({ accountIds: ["a", "b"], categoryIds: ["c"] }),
    );

    act(() => result.current.removeAccount("a"));
    expect(result.current.filter.accountIds).toEqual(["b"]);

    act(() => result.current.removeCategory("c"));
    expect(result.current.filter.categoryIds).toEqual([]);
  });

  it("setRange sets both ends in one update", () => {
    const { result } = renderHook(() => useLedgerFilters());
    act(() => result.current.setRange("2026-01-01", "2026-01-31"));
    expect(result.current.filter.from).toBe("2026-01-01");
    expect(result.current.filter.to).toBe("2026-01-31");
  });

  it("removeDateRange clears both ends", () => {
    const { result } = renderHook(() => useLedgerFilters({ from: "2026-01-01", to: "2026-01-31" }));
    act(() => result.current.removeDateRange());
    expect(result.current.filter.from).toBe("");
    expect(result.current.filter.to).toBe("");
  });

  it("clearAll resets to empty, even over an initial seed", () => {
    const { result } = renderHook(() => useLedgerFilters({ accountIds: ["acc-1"] }));
    act(() => result.current.clearAll());
    expect(result.current.filter).toEqual(EMPTY_LEDGER_FILTER);
  });

  /**
   * M4 (round 2) — the field is immediate, the query is not. Fake timers
   * rather than a wait: the delay is a fact about the hook, and a test that
   * slept for it would be 250 ms slower for no extra proof.
   */
  it("draft mirrors the filter's own fields, with text debounced", () => {
    vi.useFakeTimers();
    try {
      const { result } = renderHook(() => useLedgerFilters());
      act(() => result.current.setText("coffee"));

      // The field already reads "coffee"; the query still reads nothing.
      expect(result.current.filter.text).toBe("coffee");
      expect(result.current.draft.text).toBe("");

      act(() => vi.advanceTimersByTime(TEXT_FILTER_DEBOUNCE_MS));
      expect(result.current.draft).toEqual({
        text: "coffee",
        accountIds: [],
        categoryIds: [],
        scope: "all",
        currency: "",
        from: "",
        to: "",
      });
    } finally {
      vi.useRealTimers();
    }
  });

  /**
   * §4's two extra desk dimensions (DESK3 round 1, M). `counterpartyId` is
   * *absent* from the draft when unset rather than `""` — the port reads any
   * present `counterpartyId` as a filter, so an empty one would match no row
   * at all instead of every row.
   */
  it("counterparty leaves the draft entirely when unset, and joins it when set", () => {
    const { result } = renderHook(() => useLedgerFilters());
    expect("counterpartyId" in result.current.draft).toBe(false);
    expect(result.current.hasActiveFilter).toBe(false);

    act(() => result.current.setCounterpartyId("cp-1"));
    expect(result.current.draft.counterpartyId).toBe("cp-1");
    expect(result.current.hasActiveFilter).toBe(true);
  });

  it("currency is an active filter, and clearAll forgets it", () => {
    const { result } = renderHook(() => useLedgerFilters());
    act(() => result.current.setCurrency("EUR"));
    expect(result.current.draft.currency).toBe("EUR");
    expect(result.current.hasActiveFilter).toBe(true);

    act(() => result.current.clearAll());
    expect(result.current.filter).toEqual(EMPTY_LEDGER_FILTER);
    expect(result.current.hasActiveFilter).toBe(false);
  });
});
