/** @vitest-environment jsdom */

import { act, renderHook } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { useLedgerTableSelection } from "./use-ledger-table-selection.ts";

const ROWS = [
  { id: "a", selectable: true },
  { id: "b", selectable: true },
  { id: "c", selectable: true },
  { id: "d", selectable: true },
  { id: "e", selectable: true },
];

describe("useLedgerTableSelection", () => {
  it("starts empty", () => {
    const { result } = renderHook(() => useLedgerTableSelection(ROWS));
    expect(result.current.count).toBe(0);
  });

  it("an ordinary click toggles one row", () => {
    const { result } = renderHook(() => useLedgerTableSelection(ROWS));

    act(() => result.current.toggleRow("b", false));
    expect(result.current.isSelected("b")).toBe(true);
    expect(result.current.count).toBe(1);

    act(() => result.current.toggleRow("b", false));
    expect(result.current.isSelected("b")).toBe(false);
    expect(result.current.count).toBe(0);
  });

  it("shift-click selects the inclusive range from the anchor", () => {
    const { result } = renderHook(() => useLedgerTableSelection(ROWS));

    act(() => result.current.toggleRow("b", false));
    act(() => result.current.toggleRow("d", true));

    expect(result.current.selectedIds).toEqual(new Set(["b", "c", "d"]));
  });

  it("a range shift-click going backwards still selects the rows between", () => {
    const { result } = renderHook(() => useLedgerTableSelection(ROWS));

    act(() => result.current.toggleRow("d", false));
    act(() => result.current.toggleRow("b", true));

    expect(result.current.selectedIds).toEqual(new Set(["b", "c", "d"]));
  });

  it("a second shift-click replaces the range rather than adding to it", () => {
    const { result } = renderHook(() => useLedgerTableSelection(ROWS));

    act(() => result.current.toggleRow("a", false));
    act(() => result.current.toggleRow("c", true));
    expect(result.current.selectedIds).toEqual(new Set(["a", "b", "c"]));

    act(() => result.current.toggleRow("b", true));
    expect(result.current.selectedIds).toEqual(new Set(["a", "b"]));
  });

  it("shift-click with no anchor yet behaves like an ordinary click", () => {
    const { result } = renderHook(() => useLedgerTableSelection(ROWS));

    act(() => result.current.toggleRow("c", true));
    expect(result.current.selectedIds).toEqual(new Set(["c"]));
  });

  it("clear empties the selection and the anchor", () => {
    const { result } = renderHook(() => useLedgerTableSelection(ROWS));

    act(() => result.current.toggleRow("a", false));
    act(() => result.current.clear());
    expect(result.current.count).toBe(0);

    // The anchor cleared too — a shift-click right after starts fresh.
    act(() => result.current.toggleRow("d", true));
    expect(result.current.selectedIds).toEqual(new Set(["d"]));
  });

  /** H6 (DESK3 review round 1) — the hook's own wiring onto `selectableRange`. */
  it("shift-click skips a non-selectable row inside the range, and the count matches", () => {
    const withTransfer = [
      { id: "a", selectable: true },
      { id: "b", selectable: true },
      { id: "transfer", selectable: false },
      { id: "d", selectable: true },
    ];
    const { result } = renderHook(() => useLedgerTableSelection(withTransfer));

    act(() => result.current.toggleRow("a", false));
    act(() => result.current.toggleRow("d", true));

    expect(result.current.selectedIds).toEqual(new Set(["a", "b", "d"]));
    expect(result.current.isSelected("transfer")).toBe(false);
    expect(result.current.count).toBe(3);
  });

  it("drops a selected row once it falls out of the current row set", () => {
    const { result, rerender } = renderHook(({ rows }) => useLedgerTableSelection(rows), {
      initialProps: { rows: ROWS },
    });

    act(() => result.current.toggleRow("b", false));
    act(() => result.current.toggleRow("d", true));
    expect(result.current.count).toBe(3);

    rerender({ rows: ROWS.filter((row) => row.id !== "c") });
    expect(result.current.selectedIds).toEqual(new Set(["b", "d"]));
  });
});
