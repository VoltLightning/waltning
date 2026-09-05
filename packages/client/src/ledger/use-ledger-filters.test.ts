/** @vitest-environment jsdom */

import { act, renderHook } from "@testing-library/react";
import { describe, expect, it } from "vitest";
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

  it("draft mirrors the filter's own fields, for useTransactionSearch", () => {
    const { result } = renderHook(() => useLedgerFilters());
    act(() => result.current.setText("coffee"));
    expect(result.current.draft).toEqual({
      text: "coffee",
      accountIds: [],
      categoryIds: [],
      scope: "all",
      from: "",
      to: "",
    });
  });
});
