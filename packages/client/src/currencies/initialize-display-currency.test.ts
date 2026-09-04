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
      () => null,
      USD,
    );
    await initializeDisplayCurrencyFromLedger(pref, () => [
      { code: PLN, pinned: true, isPivot: false },
      { code: USD, pinned: false, isPivot: true },
    ]);
    expect(pref.getSnapshot().currency).toBe(PLN);
  });

  // M6 — nothing pinned is never "write the pivot". A write here would
  // persist today's pivot and freeze the header on it across every future
  // launch, surviving a later `change_pivot` that never touches this store —
  // `getSnapshot`'s own `value ?? pivot` fallback already answers "nothing
  // chosen" without writing anything.
  it("M6 — nothing pinned writes nothing; getSnapshot's own fallback answers instead", async () => {
    const set = vi.fn(async () => undefined);
    const pref = createDisplayCurrencyPreference({ get: async () => null, set }, () => null, USD);
    await initializeDisplayCurrencyFromLedger(pref, () => [
      { code: PLN, pinned: false, isPivot: false },
      { code: EUR, pinned: false, isPivot: true },
    ]);
    expect(set).not.toHaveBeenCalled();
    expect(pref.getSnapshot()).toEqual({ currency: USD, hydrated: true });
  });

  it("never overwrites a stored choice — the hydration race a naive call would lose", async () => {
    const store = delayedStore("PLN");
    const pref = createDisplayCurrencyPreference(store, () => null, USD);

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
