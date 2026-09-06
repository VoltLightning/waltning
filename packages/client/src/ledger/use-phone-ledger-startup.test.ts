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
   * The header claims the retry keeps every property the guard had, StrictMode
   * included — and a StrictMode test that never presses the button is not
   * evidence of that. The retried render is double-invoked like any other, so
   * a guard that reset itself and then re-read stale state would call `start`
   * twice here and nowhere else.
   */
  it("starts once per retry under StrictMode's double-invoked render too", () => {
    const start = vi.fn(() => FAILED);
    const { result } = renderHook(({ ready }) => usePhoneLedgerStartup(ready, start), {
      initialProps: { ready: true },
      wrapper: StrictMode,
    });

    expect(start).toHaveBeenCalledTimes(1);

    act(result.current.retry);
    expect(start).toHaveBeenCalledTimes(2);

    act(result.current.retry);
    expect(start).toHaveBeenCalledTimes(3);
  });

  /** Two presses before React can re-render: both writes are idempotent. */
  it("collapses two retries in one tick into a single start", () => {
    const start = vi.fn(() => FAILED);
    const { result } = renderHook(({ ready }) => usePhoneLedgerStartup(ready, start), {
      initialProps: { ready: true },
    });

    act(() => {
      result.current.retry();
      result.current.retry();
    });

    expect(start).toHaveBeenCalledTimes(2);
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

  /**
   * The browser's whole retry path, composed. `prepare` re-opens the
   * platform's gate, so `ready` falls while the worker is re-probed — a retry
   * that only reset the guard would call `start` against exactly the state
   * that just failed, and on the browser that is a synchronous open against a
   * worker known to be cold.
   */
  it("asks the platform to re-open its gate, and starts once it settles again", () => {
    const SECOND: StubStartup = { status: "failed", error: new Error("placeholder second") };
    const start = vi
      .fn(() => FAILED)
      .mockReturnValueOnce(FAILED)
      .mockReturnValue(SECOND);
    // The gate as the platform drives it: `prepare` closes it there and then,
    // the way `retryPhoneLedger` sets the module back to "still probing" and
    // notifies its `useSyncExternalStore` subscribers.
    let gateOpen = true;
    const prepare = vi.fn(() => {
      gateOpen = false;
    });
    const { result, rerender } = renderHook(() => usePhoneLedgerStartup(gateOpen, start, prepare));

    expect(result.current.startup).toBe(FAILED);

    act(result.current.retry);

    // Re-probing: nothing has started again, and the caller renders its blank
    // frame rather than the stale failure.
    expect(prepare).toHaveBeenCalledTimes(1);
    expect(result.current.startup).toBeNull();
    expect(start).toHaveBeenCalledTimes(1);

    // It settles; exactly one new attempt.
    gateOpen = true;
    rerender();
    expect(result.current.startup).toBe(SECOND);
    expect(start).toHaveBeenCalledTimes(2);

    rerender();
    expect(start).toHaveBeenCalledTimes(2);
  });

  it("is the plain reset it always was when no platform gate is passed", () => {
    const start = vi.fn(() => FAILED);
    const { result } = renderHook(({ ready }) => usePhoneLedgerStartup(ready, start), {
      initialProps: { ready: true },
    });

    act(result.current.retry);

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
