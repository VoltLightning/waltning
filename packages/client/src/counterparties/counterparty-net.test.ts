import { currencyCode, toMoney, unitsPerPivot } from "@waltning/core/money";
import { describe, expect, it } from "vitest";
import { counterpartyNet } from "./counterparty-net.ts";

const PLN = currencyCode("PLN");
const EUR = currencyCode("EUR");
const USD = currencyCode("USD");

/** USD pivot: 1 USD, 4.00 PLN/USD, 1.00 EUR/USD — round numbers, easy to check by hand. */
function rateOf(currency: string): ReturnType<typeof unitsPerPivot> | null {
  if (currency === "USD") return unitsPerPivot("1");
  if (currency === "PLN") return unitsPerPivot("4");
  if (currency === "EUR") return unitsPerPivot("1");
  return null;
}

describe("counterpartyNet", () => {
  it("sums a single-currency balance as itself, in that currency", () => {
    const net = counterpartyNet([{ currency: PLN, balance: toMoney("100") }], PLN, rateOf);
    expect(net).toEqual({ complete: true, value: toMoney("100") });
  });

  it("converts a foreign balance into the target at each currency's own rate", () => {
    // 840 PLN at 4 PLN/USD = 210 USD-pivot; 1 EUR/USD means EUR is 1:1 with the pivot.
    const net = counterpartyNet(
      [
        { currency: PLN, balance: toMoney("840") },
        { currency: EUR, balance: toMoney("-120") },
      ],
      EUR,
      rateOf,
    );
    expect(net).toEqual({ complete: true, value: toMoney("90") });
  });

  it("is incomplete when any held currency has no rate — never a partial sum", () => {
    const net = counterpartyNet(
      [
        { currency: PLN, balance: toMoney("100") },
        { currency: USD, balance: toMoney("10") },
      ],
      EUR,
      (currency) => (currency === "PLN" ? unitsPerPivot("4") : null),
    );
    expect(net).toEqual({ complete: false });
  });

  it("is incomplete when the target currency itself has no rate", () => {
    const net = counterpartyNet([{ currency: PLN, balance: toMoney("100") }], EUR, () => null);
    expect(net).toEqual({ complete: false });
  });

  it("is zero, complete, for an empty balance list with a known target rate", () => {
    const net = counterpartyNet([], EUR, rateOf);
    expect(net).toEqual({ complete: true, value: toMoney("0") });
  });
});
