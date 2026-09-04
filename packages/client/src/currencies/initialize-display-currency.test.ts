import { currencyCode } from "@waltning/core/money";
import { describe, expect, it, vi } from "vitest";
import { createDisplayCurrencyPreference } from "./display-currency.ts";
import { initializeDisplayCurrencyFromLedger } from "./initialize-display-currency.ts";

const PLN = currencyCode("PLN");
const USD = currencyCode("USD");
const EUR = currencyCode("EUR");

/** Resolves `get()` only when `release()` is called — proves the hydration race is closed. */
function delayedStore(initial: string | null) {
  let stored = initial;
  let release: (() => void) | undefined;
  const gate = new Promise<void>((resolve) => {
    release = resolve;
  });
  return {
    release: () => release?.(),
    get: vi.fn(async () => {
      await gate;
      return stored;
    }),
    set: vi.fn(async (value: string) => {
      stored = value;
    }),
  };
}

describe("initializeDisplayCurrencyFromLedger", () => {
  it("defaults to the first pinned currency when nothing is stored", async () => {
    const pref = createDisplayCurrencyPreference(
      { get: async () => null, set: async () => undefined },
      USD,
    );
    await initializeDisplayCurrencyFromLedger(pref, () => [
      { code: PLN, pinned: true, isPivot: false },
      { code: USD, pinned: false, isPivot: true },
    ]);
    expect(pref.getSnapshot().currency).toBe(PLN);
  });

  it("falls back to the live pivot when nothing is pinned — never the seed constant", async () => {
    const pref = createDisplayCurrencyPreference(
      { get: async () => null, set: async () => undefined },
      // The seed constant this controller was built with — a fresh device's
      // bootstrap value, deliberately not EUR, so a pass here proves the
      // live reader won, not the constructor argument.
      USD,
    );
    await initializeDisplayCurrencyFromLedger(pref, () => [
      { code: PLN, pinned: false, isPivot: false },
      { code: EUR, pinned: false, isPivot: true },
    ]);
    expect(pref.getSnapshot().currency).toBe(EUR);
  });

  it("never overwrites a stored choice — the hydration race a naive call would lose", async () => {
    const store = delayedStore("PLN");
    const pref = createDisplayCurrencyPreference(store, USD);

    const init = initializeDisplayCurrencyFromLedger(pref, () => [
      { code: EUR, pinned: true, isPivot: false },
      { code: USD, pinned: false, isPivot: true },
    ]);
    // The disk read is still pending — resolve it now, proving the awaited
    // `hydrate()` inside `initializeDisplayCurrencyFromLedger` is what makes
    // this ordering safe rather than accidental.
    store.release();
    await init;

    expect(pref.getSnapshot()).toEqual({ currency: PLN, hydrated: true });
  });
});
