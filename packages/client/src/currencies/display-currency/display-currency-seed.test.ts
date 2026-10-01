import { currencyCode } from "@waltning/core/money";
import { describe, expect, it } from "vitest";
import { createDisplayCurrencyPreference } from "./display-currency.ts";

const USD = currencyCode("USD");
const EUR = currencyCode("EUR");

function store(initial: string | null) {
  return { get: async () => initial, set: async () => undefined };
}

describe("an old build's unmarked auto-write, on an install since anchored to its region", () => {
  // The old build wrote the seed pivot (USD) unmarked. This build then anchored
  // the ledger to EUR, so the live pivot is no longer USD — but the value is
  // still the old build's write, not a choice.
  it("reads as nothing chosen when it equals the build seed, though the live pivot moved", async () => {
    const pref = createDisplayCurrencyPreference(store("USD"), () => EUR, USD, {
      regionCurrency: EUR,
      readHeld: () => [USD, EUR],
    });
    await pref.hydrate();
    expect(pref.getSnapshot().currency).toBe(EUR);
  });

  it("a marked USD is a choice, whatever the seed", async () => {
    const pref = createDisplayCurrencyPreference(store("choice:USD"), () => EUR, USD, {
      regionCurrency: EUR,
      readHeld: () => [USD, EUR],
    });
    await pref.hydrate();
    expect(pref.getSnapshot().currency).toBe(USD);
  });
});
