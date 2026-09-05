/**
 * @vitest-environment jsdom
 *
 * `start` is injected — see the hook's own header — so this proves the
 * hook's own contract with a stub, never a real ledger.
 */

import { renderHook } from "@testing-library/react";
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

    expect(result.current).toBeNull();
    expect(start).not.toHaveBeenCalled();

    rerender({ ready: false });
    expect(result.current).toBeNull();
    expect(start).not.toHaveBeenCalled();
  });

  it("calls start exactly once, the moment it becomes ready, and keeps the value across re-renders", () => {
    const start = vi.fn(() => FAILED);
    const { result, rerender } = renderHook(({ ready }) => usePhoneLedgerStartup(ready, start), {
      initialProps: { ready: false },
    });

    rerender({ ready: true });
    expect(result.current).toBe(FAILED);
    expect(start).toHaveBeenCalledTimes(1);

    rerender({ ready: true });
    expect(result.current).toBe(FAILED);
    expect(start).toHaveBeenCalledTimes(1);
  });
});
