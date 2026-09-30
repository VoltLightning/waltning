/** @vitest-environment jsdom */

import { act, renderHook } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { createLastCapturePreference, LAST_USED_WINDOW_MS } from "../last-capture/last-capture.ts";
import { soleEligibleAccount, useDefaultAccount } from "./default-account.ts";

function emptyStore() {
  let stored: string | null = null;
  return {
    get: async () => stored,
    set: async (value: string) => {
      stored = value;
    },
  };
}

const ONE = [{ id: "account-a", capturable: true }];
const TWO = [
  { id: "account-a", capturable: true },
  { id: "account-b", capturable: true },
];

describe("soleEligibleAccount — S05 §9.2's single-account case", () => {
  it("names the one capturable account", () => {
    expect(soleEligibleAccount(ONE)).toBe("account-a");
  });

  it("names nothing when two accounts could take the row", () => {
    expect(soleEligibleAccount(TWO)).toBeNull();
  });

  it("does not count an account that cannot take the row, or an archived one", () => {
    expect(
      soleEligibleAccount([
        { id: "account-a", capturable: true },
        { id: "account-b", capturable: false },
        { id: "account-c", capturable: true, archived: true },
      ]),
    ).toBe("account-a");
    expect(soleEligibleAccount([{ id: "account-b", capturable: false }])).toBeNull();
    expect(soleEligibleAccount([])).toBeNull();
  });
});

describe("useDefaultAccount", () => {
  it("fills the only account on a ledger with no history", () => {
    const pref = createLastCapturePreference(emptyStore());
    const { result } = renderHook(() => useDefaultAccount(pref, 1000, ONE));
    expect(result.current).toBe("account-a");
  });

  it("leaves two accounts with no history unfilled", () => {
    const pref = createLastCapturePreference(emptyStore());
    const { result } = renderHook(() => useDefaultAccount(pref, 1000, TWO));
    expect(result.current).toBeNull();
  });

  it("lets the last-used account win inside its window", async () => {
    const pref = createLastCapturePreference(emptyStore());
    await act(async () => {
      await pref.set({ accountId: "account-b", at: 1000 });
    });
    const { result } = renderHook(() => useDefaultAccount(pref, 2000, TWO));
    expect(result.current).toBe("account-b");
  });

  it("does not fill a choice of two after the window, but still fills a sole account", async () => {
    const pref = createLastCapturePreference(emptyStore());
    await act(async () => {
      await pref.set({ accountId: "account-b", at: 1000 });
    });
    const later = 1000 + LAST_USED_WINDOW_MS;
    expect(renderHook(() => useDefaultAccount(pref, later, TWO)).result.current).toBeNull();
    expect(renderHook(() => useDefaultAccount(pref, later, ONE)).result.current).toBe("account-a");
  });
});
