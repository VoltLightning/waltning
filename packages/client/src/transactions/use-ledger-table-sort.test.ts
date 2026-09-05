/** @vitest-environment jsdom */

import { act, renderHook } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { useLedgerTableSort } from "./use-ledger-table-sort.ts";

describe("useLedgerTableSort", () => {
  it("starts at the natural order by default", () => {
    const { result } = renderHook(() => useLedgerTableSort());
    expect(result.current.sort).toBeNull();
  });

  it("cycles a column asc → desc → natural on repeated clicks", () => {
    const { result } = renderHook(() => useLedgerTableSort());

    act(() => result.current.onSortColumn("payee"));
    expect(result.current.sort).toEqual({ column: "payee", direction: "asc" });

    act(() => result.current.onSortColumn("payee"));
    expect(result.current.sort).toEqual({ column: "payee", direction: "desc" });

    act(() => result.current.onSortColumn("payee"));
    expect(result.current.sort).toBeNull();
  });

  it("switching to a different column always starts at asc", () => {
    const { result } = renderHook(() => useLedgerTableSort());

    act(() => result.current.onSortColumn("amount"));
    act(() => result.current.onSortColumn("amount"));
    expect(result.current.sort).toEqual({ column: "amount", direction: "desc" });

    act(() => result.current.onSortColumn("date"));
    expect(result.current.sort).toEqual({ column: "date", direction: "asc" });
  });
});
