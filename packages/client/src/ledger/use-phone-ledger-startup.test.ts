/**
 * @vitest-environment jsdom
 *
 * `start` is injected — see the hook's own header — so this proves the
 * hook's own contract with a stub, never a real ledger.
 */

import { act, renderHook } from "@testing-library/react";
import { StrictMode } from "react";
import { describe, expect, it, vi } from "vitest";
import { usePhoneLedgerStartup } from "./use-phone-ledger-startup.ts";

type StubStartup = { status: "failed"; error: Error };

const FAILED: StubStartup = { status: "failed", error: new Error("placeholder failure") };

describe("usePhoneLedgerStartup", () => {
  it("is null and calls start nothing while not ready", () => {
    const start = vi.fn(() => FAILED);
    const { result, rerender } = renderHook(({ ready }) => usePhoneLedgerStartup(ready, start), {
      initialProps: { ready: false },
    });

    expect(result.current.startup).toBeNull();
    expect(start).not.toHaveBeenCalled();

    rerender({ ready: false });
    expect(result.current.startup).toBeNull();
    expect(start).not.toHaveBeenCalled();
  });

  it("calls start exactly once, the moment it becomes ready, and keeps the value across re-renders", () => {
    const start = vi.fn(() => FAILED);
    const { result, rerender } = renderHook(({ ready }) => usePhoneLedgerStartup(ready, start), {
      initialProps: { ready: false },
    });

    rerender({ ready: true });
    expect(result.current.startup).toBe(FAILED);
    expect(start).toHaveBeenCalledTimes(1);

    rerender({ ready: true });
    expect(result.current.startup).toBe(FAILED);
    expect(start).toHaveBeenCalledTimes(1);
  });

  /**
   * L-4's own case: `StrictMode` double-invokes a render function to surface
   * an impure one, which is exactly what a `useMemo` guard cannot survive —
   * a memo is a cache React is free to discard and recompute, and StrictMode
   * relies on that freedom. The `useRef` guard is not a cache; it is state
   * that has already flipped by the second of the two synchronous calls.
   */
  it("calls start exactly once even under StrictMode's double-invoked render", () => {
    const start = vi.fn(() => FAILED);
    const { result, rerender } = renderHook(({ ready }) => usePhoneLedgerStartup(ready, start), {
      initialProps: { ready: false },
      wrapper: StrictMode,
    });

    expect(result.current.startup).toBeNull();
    expect(start).not.toHaveBeenCalled();

    rerender({ ready: true });
    expect(result.current.startup).toBe(FAILED);
    expect(start).toHaveBeenCalledTimes(1);

    rerender({ ready: true });
    expect(result.current.startup).toBe(FAILED);
    expect(start).toHaveBeenCalledTimes(1);
  });

  /**
   * The failure screen's own "Try again". A held SQLite worker in the browser
   * clears by itself, so the guard has to be resettable — and resettable
   * exactly once per press, or a screen that re-renders on anything else would
   * quietly reopen the ledger behind whoever is looking at it.
   */
  it("starts again exactly once per retry, and keeps the new answer", () => {
    const SECOND: StubStartup = { status: "failed", error: new Error("placeholder second") };
    const start = vi
      .fn(() => FAILED)
      .mockReturnValueOnce(FAILED)
      .mockReturnValue(SECOND);
    const { result, rerender } = renderHook(({ ready }) => usePhoneLedgerStartup(ready, start), {
      initialProps: { ready: true },
    });

    expect(result.current.startup).toBe(FAILED);
    expect(start).toHaveBeenCalledTimes(1);

    act(result.current.retry);
    expect(result.current.startup).toBe(SECOND);
    expect(start).toHaveBeenCalledTimes(2);

    rerender({ ready: true });
    expect(result.current.startup).toBe(SECOND);
    expect(start).toHaveBeenCalledTimes(2);
  });

  it("does not start on retry while the platform is not ready", () => {
    const start = vi.fn(() => FAILED);
    const { result } = renderHook(({ ready }) => usePhoneLedgerStartup(ready, start), {
      initialProps: { ready: false },
    });

    act(result.current.retry);

    expect(result.current.startup).toBeNull();
    expect(start).not.toHaveBeenCalled();
  });
});
