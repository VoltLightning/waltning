/** @vitest-environment jsdom */

import { act, renderHook } from "@testing-library/react";
import { type CurrencyCode, currencyCode } from "@waltning/core/money";
import { describe, expect, it, vi } from "vitest";
import { createDisplayCurrencyPreference, useDisplayCurrency } from "./display-currency.ts";

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

/** A mutable live-pivot reader, standing in for `currencies.find(isPivot)` over a session snapshot. */
function livePivot(initial: CurrencyCode | null) {
  let current = initial;
  return { read: () => current, set: (value: CurrencyCode | null) => (current = value) };
}

const noPivot = () => null;

/** Stands in for `phoneLedger.subscribe` — every listener fires on `notify()`, the same shape `refresh()` calls after a successful write. */
function fakeLedgerNotifier() {
  const listeners = new Set<() => void>();
  return {
    subscribe: (listener: () => void) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    notify: () => {
      for (const listener of listeners) listener();
    },
  };
}

describe("createDisplayCurrencyPreference", () => {
  it("falls back to the seed when nothing is chosen and no live pivot exists yet", () => {
    const pref = createDisplayCurrencyPreference(memoryStore(null), noPivot, USD);
    expect(pref.getSnapshot()).toEqual({ currency: USD, hydrated: false });
  });

  // H1 — the display default must not be the build-time seed when a live
  // pivot is available: a fresh install whose ledger pivot is PLN renders
  // PLN, not the seed USD.
  it("H1 — pivot PLN, nothing pinned, nothing stored → PLN", () => {
    const pref = createDisplayCurrencyPreference(memoryStore(null), () => PLN, USD);
    expect(pref.getSnapshot()).toEqual({ currency: PLN, hydrated: false });
  });

  // H1 — after `change_pivot`, the header follows: no store write, the next
  // read of the live reader is what changes, live.
  it("H1 — after change_pivot, the header follows the live pivot", () => {
    const pivot = livePivot(PLN);
    const pref = createDisplayCurrencyPreference(memoryStore(null), pivot.read, USD);
    expect(pref.getSnapshot().currency).toBe(PLN);
    pivot.set(EUR);
    expect(pref.getSnapshot().currency).toBe(EUR);
  });

  // M2 — `subscribe` was the device store's alone, and `change_pivot` writes
  // no device preference, so a mounted `useSyncExternalStore` consumer kept
  // the old pivot until an unrelated re-render happened to call
  // `getSnapshot()` again. `subscribeToLedger` composes the ledger's own
  // write notifications in, so the rendered value follows live.
  it("M2 — a mounted consumer follows the live pivot on a ledger notification, with no device-store write", () => {
    const pivot = livePivot(PLN);
    const ledger = fakeLedgerNotifier();
    const pref = createDisplayCurrencyPreference(memoryStore(null), pivot.read, USD, {
      subscribeToLedger: ledger.subscribe,
    });
    const { result } = renderHook(() => useDisplayCurrency(pref));

    expect(result.current.currency).toBe(PLN);

    pivot.set(EUR);
    act(() => ledger.notify());

    expect(result.current.currency).toBe(EUR);
  });

  it("never surfaces null — the guarantee this wraps createDevicePreference for", async () => {
    const pref = createDisplayCurrencyPreference(memoryStore(null), noPivot, USD);
    await pref.hydrate();
    expect(pref.getSnapshot().currency).toBe(USD);
  });

  it("holds a chosen currency once hydration reads it off disk", async () => {
    const pref = createDisplayCurrencyPreference(memoryStore("PLN"), noPivot, USD);
    await pref.hydrate();
    expect(pref.getSnapshot()).toEqual({ currency: PLN, hydrated: true });
  });

  it("treats a corrupt stored value as nothing chosen, falling back to the live pivot", async () => {
    const pref = createDisplayCurrencyPreference(memoryStore("not-a-currency"), () => EUR, USD);
    await pref.hydrate();
    expect(pref.getSnapshot()).toEqual({ currency: EUR, hydrated: true });
  });

  it("set() persists and is reflected immediately", async () => {
    const store = memoryStore(null);
    const pref = createDisplayCurrencyPreference(store, noPivot, USD);
    const write = pref.set(EUR);
    expect(pref.getSnapshot().currency).toBe(EUR);
    await write;
    expect(store.stored()).toBe("choice:EUR");
  });

  it("a chosen value wins over the live pivot regardless of what it reads", async () => {
    const pref = createDisplayCurrencyPreference(memoryStore(null), () => PLN, USD);
    await pref.set(EUR);
    expect(pref.getSnapshot().currency).toBe(EUR);
  });
});

describe("createDisplayCurrencyPreference — the device's region (§7.0)", () => {
  const held = () => [USD, PLN, EUR];

  it("a fresh ledger in a euro region opens in EUR, not the pivot", () => {
    const pref = createDisplayCurrencyPreference(memoryStore(null), () => USD, USD, {
      regionCurrency: EUR,
      readHeld: held,
    });
    expect(pref.getSnapshot().currency).toBe(EUR);
  });

  it("an unknown region falls on the pivot", () => {
    const pref = createDisplayCurrencyPreference(memoryStore(null), () => USD, USD, {
      regionCurrency: null,
      readHeld: held,
    });
    expect(pref.getSnapshot().currency).toBe(USD);
  });

  it("a region currency the ledger does not hold falls on the pivot", () => {
    const pref = createDisplayCurrencyPreference(memoryStore(null), () => USD, USD, {
      regionCurrency: currencyCode("CHF"),
      readHeld: held,
    });
    expect(pref.getSnapshot().currency).toBe(USD);
  });

  it("a ledger not ready to say what it holds falls on the pivot, then follows once it can", () => {
    let codes: CurrencyCode[] | null = null;
    const pref = createDisplayCurrencyPreference(memoryStore(null), () => USD, USD, {
      regionCurrency: EUR,
      readHeld: () => codes,
    });
    expect(pref.getSnapshot().currency).toBe(USD);
    codes = [USD, EUR];
    expect(pref.getSnapshot().currency).toBe(EUR);
  });

  it("an explicit choice beats the region", async () => {
    const pref = createDisplayCurrencyPreference(memoryStore("PLN"), () => USD, USD, {
      regionCurrency: EUR,
      readHeld: held,
    });
    await pref.hydrate();
    expect(pref.getSnapshot().currency).toBe(PLN);
  });
});

describe("createDisplayCurrencyPreference — a stored value's origin (§7.0)", () => {
  // The old build wrote the pivot on its own at first start, unmarked.
  it("an unmarked value equal to the live pivot is that auto-write, not a choice", async () => {
    const pref = createDisplayCurrencyPreference(memoryStore("USD"), () => USD, USD, {
      regionCurrency: EUR,
      readHeld: () => [USD, EUR],
    });
    await pref.hydrate();
    expect(pref.getSnapshot().currency).toBe(EUR);
  });

  it("an unmarked value that is not the pivot was picked in the toggle, and stands", async () => {
    const pref = createDisplayCurrencyPreference(memoryStore("PLN"), () => USD, USD, {
      regionCurrency: EUR,
      readHeld: () => [USD, PLN, EUR],
    });
    await pref.hydrate();
    expect(pref.getSnapshot().currency).toBe(PLN);
  });

  it("a marked choice equal to the pivot is a choice, and beats the region", async () => {
    const pref = createDisplayCurrencyPreference(memoryStore("choice:USD"), () => USD, USD, {
      regionCurrency: EUR,
      readHeld: () => [USD, EUR],
    });
    await pref.hydrate();
    expect(pref.getSnapshot().currency).toBe(USD);
  });

  it("choosing the pivot after an unmarked pivot value makes it a choice", async () => {
    const store = memoryStore("USD");
    const pref = createDisplayCurrencyPreference(store, () => USD, USD, {
      regionCurrency: EUR,
      readHeld: () => [USD, EUR],
    });
    await pref.hydrate();
    await pref.set(USD);
    expect(store.stored()).toBe("choice:USD");
    expect(pref.getSnapshot().currency).toBe(USD);
  });
});
