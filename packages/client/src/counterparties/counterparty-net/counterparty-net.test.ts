import { accountingDate } from "@waltning/core/date";
import { currencyCode, toMoney, unitsPerPivot } from "@waltning/core/money";
import { describe, expect, it } from "vitest";
import { type CounterpartyRate, counterpartyNet } from "./counterparty-net.ts";

const PLN = currencyCode("PLN");
const EUR = currencyCode("EUR");
const USD = currencyCode("USD");
const TODAY = accountingDate("2026-09-04");
const STALE = accountingDate("2026-08-30");

/** USD pivot: 1 USD, 4.00 PLN/USD, 1.00 EUR/USD — round numbers, easy to check by hand. */
function rateOf(currency: string): CounterpartyRate | null {
  if (currency === "USD") return { rate: unitsPerPivot("1"), asOf: TODAY };
  if (currency === "PLN") return { rate: unitsPerPivot("4"), asOf: TODAY };
  if (currency === "EUR") return { rate: unitsPerPivot("1"), asOf: TODAY };
  return null;
}

describe("counterpartyNet", () => {
  it("sums a single-currency balance as itself, in that currency", () => {
    const net = counterpartyNet([{ currency: PLN, balance: toMoney("100") }], PLN, rateOf);
    expect(net).toEqual({ complete: true, value: toMoney("100"), asOf: null });
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
    expect(net).toEqual({ complete: true, value: toMoney("90"), asOf: TODAY });
  });

  it("is incomplete when any held currency has no rate — never a partial sum", () => {
    const net = counterpartyNet(
      [
        { currency: PLN, balance: toMoney("100") },
        { currency: USD, balance: toMoney("10") },
      ],
      EUR,
      (currency) => (currency === "PLN" ? { rate: unitsPerPivot("4"), asOf: TODAY } : null),
    );
    expect(net).toEqual({ complete: false });
  });

  it("is incomplete when the target currency itself has no rate", () => {
    const net = counterpartyNet([{ currency: PLN, balance: toMoney("100") }], EUR, () => null);
    expect(net).toEqual({ complete: false });
  });

  it("is zero, complete, for an empty balance list with a known target rate", () => {
    const net = counterpartyNet([], EUR, rateOf);
    expect(net).toEqual({ complete: true, value: toMoney("0"), asOf: null });
  });

  it("is complete even with no rate at all, when every held currency already is the target", () => {
    const net = counterpartyNet([{ currency: PLN, balance: toMoney("50") }], PLN, () => null);
    expect(net).toEqual({ complete: true, value: toMoney("50"), asOf: null });
  });

  /** M1 — one stale carried leg: the fold's own date is the oldest rate actually used, not today's. */
  it("carries the oldest asOf among the legs actually converted — one stale carried leg", () => {
    const staleRateOf = (currency: string): CounterpartyRate | null => {
      if (currency === "PLN") return { rate: unitsPerPivot("4"), asOf: STALE };
      if (currency === "EUR") return { rate: unitsPerPivot("1"), asOf: TODAY };
      return null;
    };
    const net = counterpartyNet(
      [
        { currency: PLN, balance: toMoney("840") },
        { currency: EUR, balance: toMoney("-120") },
      ],
      EUR,
      staleRateOf,
    );
    if (!net.complete) throw new Error("expected a complete net");
    expect(net.asOf).toBe(STALE);
  });
});
