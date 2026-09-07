/** @vitest-environment jsdom */

import { act, renderHook } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import {
  createLastCapturePreference,
  LAST_USED_WINDOW_MS,
  useLastUsedAccount,
} from "./last-capture.ts";

function memoryStore(initial: string | null = null) {
  let stored = initial;
  return {
    get: vi.fn(async () => stored),
    set: vi.fn(async (value: string) => {
      stored = value;
    }),
  };
}

const ACCOUNTS = [
  { id: "account-a", capturable: true },
  { id: "account-b", capturable: false },
];

describe("createLastCapturePreference", () => {
  it("round-trips accountId and at through the store", async () => {
    const pref = createLastCapturePreference(memoryStore());
    await pref.set({ accountId: "account-a", at: 1000 });
    expect(pref.getSnapshot()).toEqual({
      value: { accountId: "account-a", at: 1000 },
      hydrated: true,
    });
  });

  it("treats a corrupt or partial value as nothing stored", async () => {
    const pref = createLastCapturePreference(memoryStore('{"accountId":123}'));
    await pref.hydrate();
    expect(pref.getSnapshot()).toEqual({ value: null, hydrated: true });
  });

  /** M2 — a capture stamped in the future is not a fact this device can trust. */
  it("rejects a stored value stamped in the future", async () => {
    const futureAt = Date.now() + 60 * 60 * 1000;
    const pref = createLastCapturePreference(
      memoryStore(JSON.stringify({ accountId: "account-a", at: futureAt })),
    );
    await pref.hydrate();
    expect(pref.getSnapshot()).toEqual({ value: null, hydrated: true });
  });
});

describe("useLastUsedAccount — S05 §9.2's four-hour window", () => {
  it("fills the account inside the window", async () => {
    const pref = createLastCapturePreference(memoryStore());
    await act(async () => {
      await pref.set({ accountId: "account-a", at: 1000 });
    });
    const { result } = renderHook(() =>
      useLastUsedAccount(pref, 1000 + LAST_USED_WINDOW_MS - 1, ACCOUNTS),
    );
    expect(result.current).toBe("account-a");
  });

  it("does not fill it once the window has passed", async () => {
    const pref = createLastCapturePreference(memoryStore());
    await act(async () => {
      await pref.set({ accountId: "account-a", at: 1000 });
    });
    const { result } = renderHook(() =>
      useLastUsedAccount(pref, 1000 + LAST_USED_WINDOW_MS, ACCOUNTS),
    );
    expect(result.current).toBeNull();
  });

  it("does not fill an account that has since become uncapturable or archived", async () => {
    const pref = createLastCapturePreference(memoryStore());
    await act(async () => {
      await pref.set({ accountId: "account-b", at: 1000 });
    });
    const { result: uncapturable } = renderHook(() => useLastUsedAccount(pref, 1000, ACCOUNTS));
    expect(uncapturable.current).toBeNull();

    await act(async () => {
      await pref.set({ accountId: "account-gone", at: 1000 });
    });
    // Archived accounts are excluded from the list this hook is given
    // (`PhoneLedgerSnapshot#accounts` already filters them), so a stale id
    // simply is not found.
    const { result: archived } = renderHook(() => useLastUsedAccount(pref, 1000, ACCOUNTS));
    expect(archived.current).toBeNull();
  });

  /**
   * M2 — a bare `age >= WINDOW` check lets a backwards clock produce a
   * negative age, which reads as "just captured" and reopens a window that
   * should have stayed closed. `set` bypasses `parseLastCapture` (it writes
   * the in-memory value directly), so this is the one way to hold a
   * future-`at` value in the hook under test without the parser's own guard
   * intercepting it first.
   */
  it("does not fill the account when the clock has moved behind the stored capture", async () => {
    const pref = createLastCapturePreference(memoryStore());
    await act(async () => {
      await pref.set({ accountId: "account-a", at: 10_000 });
    });
    const { result } = renderHook(() => useLastUsedAccount(pref, 5_000, ACCOUNTS));
    expect(result.current).toBeNull();
  });

  it("is null before anything has ever been captured", () => {
    const pref = createLastCapturePreference(memoryStore());
    const { result } = renderHook(() => useLastUsedAccount(pref, 1000, ACCOUNTS));
    expect(result.current).toBeNull();
  });
});
