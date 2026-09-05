/** @vitest-environment jsdom */

import { act, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { TEXT_FILTER_DEBOUNCE_MS, useDebouncedValue } from "./use-debounced-value.ts";

describe("useDebouncedValue", () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it("returns the first value immediately — a mount is not a change", () => {
    const { result } = renderHook(() => useDebouncedValue("coffee", TEXT_FILTER_DEBOUNCE_MS));
    expect(result.current).toBe("coffee");
  });

  it("holds a change back for the delay, then commits it", () => {
    const { result, rerender } = renderHook(
      ({ value }: { value: string }) => useDebouncedValue(value, TEXT_FILTER_DEBOUNCE_MS),
      { initialProps: { value: "" } },
    );

    rerender({ value: "gro" });
    expect(result.current).toBe("");

    act(() => vi.advanceTimersByTime(TEXT_FILTER_DEBOUNCE_MS - 1));
    expect(result.current).toBe("");

    act(() => vi.advanceTimersByTime(1));
    expect(result.current).toBe("gro");
  });

  it("only the last value of a burst is ever committed", () => {
    const { result, rerender } = renderHook(
      ({ value }: { value: string }) => useDebouncedValue(value, TEXT_FILTER_DEBOUNCE_MS),
      { initialProps: { value: "" } },
    );

    for (const value of ["g", "gr", "gro", "groc"]) {
      rerender({ value });
      act(() => vi.advanceTimersByTime(TEXT_FILTER_DEBOUNCE_MS - 50));
    }
    // Four keystrokes, 200 ms apart in this test's own clock, and nothing
    // has committed yet — every one of them cancelled the previous timer.
    expect(result.current).toBe("");

    act(() => vi.advanceTimersByTime(TEXT_FILTER_DEBOUNCE_MS));
    expect(result.current).toBe("groc");
  });

  it("a value that returns to what is already settled commits nothing", () => {
    const { result, rerender } = renderHook(
      ({ value }: { value: string }) => useDebouncedValue(value, TEXT_FILTER_DEBOUNCE_MS),
      { initialProps: { value: "gro" } },
    );

    rerender({ value: "grox" });
    rerender({ value: "gro" });
    act(() => vi.advanceTimersByTime(TEXT_FILTER_DEBOUNCE_MS * 2));
    expect(result.current).toBe("gro");
  });
});
