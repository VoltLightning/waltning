import { currencyCode } from "@waltning/core/money";
import { describe, expect, it, vi } from "vitest";
import { createDisplayCurrencyPreference } from "./display-currency.ts";

const PLN = currencyCode("PLN");
const USD = currencyCode("USD");
const EUR = currencyCode("EUR");

function memoryStore(initial: string | null) {
  let stored = initial;
  return {
    stored: () => stored,
    get: vi.fn(async () => stored),
    set: vi.fn(async (value: string) => {
      stored = value;
    }),
  };
}

describe("createDisplayCurrencyPreference", () => {
  it("falls back to the pivot before anything is chosen — §7.0's default", () => {
    const pref = createDisplayCurrencyPreference(memoryStore(null), USD);
    expect(pref.getSnapshot()).toEqual({ currency: USD, hydrated: false });
  });

  it("never surfaces null — the guarantee this wraps createDevicePreference for", async () => {
    const pref = createDisplayCurrencyPreference(memoryStore(null), USD);
    await pref.hydrate();
    expect(pref.getSnapshot().currency).toBe(USD);
  });

  it("holds a chosen currency once hydration reads it off disk", async () => {
    const pref = createDisplayCurrencyPreference(memoryStore("PLN"), USD);
    await pref.hydrate();
    expect(pref.getSnapshot()).toEqual({ currency: PLN, hydrated: true });
  });

  it("treats a corrupt stored value as nothing chosen, falling back to the pivot", async () => {
    const pref = createDisplayCurrencyPreference(memoryStore("not-a-currency"), USD);
    await pref.hydrate();
    expect(pref.getSnapshot()).toEqual({ currency: USD, hydrated: true });
  });

  it("set() persists and is reflected immediately", async () => {
    const store = memoryStore(null);
    const pref = createDisplayCurrencyPreference(store, USD);
    const write = pref.set(EUR);
    expect(pref.getSnapshot().currency).toBe(EUR);
    await write;
    expect(store.stored()).toBe("EUR");
  });

  describe("initializeFromPinned", () => {
    it("adopts the first pinned currency when nothing has been chosen", () => {
      const pref = createDisplayCurrencyPreference(memoryStore(null), USD);
      pref.initializeFromPinned([PLN, EUR]);
      expect(pref.getSnapshot().currency).toBe(PLN);
    });

    it("falls back to the pivot when nothing is pinned", () => {
      const pref = createDisplayCurrencyPreference(memoryStore(null), USD);
      pref.initializeFromPinned([]);
      expect(pref.getSnapshot().currency).toBe(USD);
    });

    it("never overrides a value someone already chose", async () => {
      const pref = createDisplayCurrencyPreference(memoryStore(null), USD);
      await pref.set(EUR);
      pref.initializeFromPinned([PLN]);
      expect(pref.getSnapshot().currency).toBe(EUR);
    });

    it("is a no-op the second time it is called", () => {
      const pref = createDisplayCurrencyPreference(memoryStore(null), USD);
      pref.initializeFromPinned([PLN]);
      pref.initializeFromPinned([EUR]);
      expect(pref.getSnapshot().currency).toBe(PLN);
    });
  });
});
