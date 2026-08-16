/**
 * `money.ts` is the one money implementation, running on the server and on the
 * phone. These pin the properties the ledger depends on — not the library's
 * behaviour, which could change under us, but *ours*.
 *
 * Written after an adversarial pass. Everything here held under attack; the
 * point of the file is that it keeps holding.
 */

import { Decimal as GlobalDecimal } from "decimal.js";
import { describe, expect, it } from "vitest";
import * as money from "./money.ts";

describe("exactness", () => {
  it("does not lose the classic float case", () => {
    expect(money.add("0.10000000", "0.20000000")).toBe("0.30000000");
  });

  it("stays exact well past 8 decimal places of magnitude", () => {
    expect(money.add("99999999999.99999999", "0.00000001")).toBe("100000000000.00000000");
  });

  it("sums an empty ledger to zero rather than throwing", () => {
    expect(money.sum([])).toBe("0.00000000");
  });

  it("sums a large batch without drift", () => {
    const cents = Array.from({ length: 10_000 }, () => "0.01000000");
    expect(money.sum(cents)).toBe("100.00000000");
  });
});

describe("rounding", () => {
  /**
   * Half-up, not half-even. The difference is systematic rather than random —
   * over a five-year ledger banker's rounding pulls totals toward even cents —
   * so it is a specified decision, not a library default.
   */
  it("rounds half away from zero", () => {
    expect(money.toMoney("1.005", 2)).toBe("1.01");
    expect(money.toMoney("1.015", 2)).toBe("1.02");
    expect(money.toMoney("2.675", 2)).toBe("2.68");
  });

  it("is idempotent — rounding twice equals rounding once", () => {
    const once = money.toMoney("1.005", 2);
    expect(money.toMoney(once, 2)).toBe(once);
  });

  it("cannot be changed by another module reconfiguring decimal.js globally", () => {
    // The failure this prevents: a dependency calls Decimal.set and every
    // amount in the ledger quietly starts rounding differently.
    GlobalDecimal.set({ rounding: GlobalDecimal.ROUND_DOWN });
    try {
      expect(money.toMoney("1.005", 2)).toBe("1.01");
    } finally {
      GlobalDecimal.set({ rounding: GlobalDecimal.ROUND_HALF_UP });
    }
  });
});

describe("signs", () => {
  it("normalises negative zero — a balance is never '-0'", () => {
    expect(money.sub("1.00000000", "1.00000000")).toBe("0.00000000");
    expect(money.neg("0.00000000")).toBe("0.00000000");
    expect(money.isZero("-0.00000000")).toBe(true);
    expect(money.cmp("-0.00000000", "0.00000000")).toBe(0);
  });

  it("keeps sign through abs and neg", () => {
    expect(money.abs("-42.50000000")).toBe("42.50000000");
    expect(money.neg("-42.50000000")).toBe("42.50000000");
  });
});

describe("representation", () => {
  it("never emits exponent notation, however small or large", () => {
    for (const v of ["0.00000001", "1e-8", "1e21", "12345678901234567890.12345678"]) {
      expect(money.toMoney(v)).not.toMatch(/e/i);
    }
  });

  it("is locale-independent — the phone and the server must agree", () => {
    // A `toLocaleString` anywhere in this path would render 1 234,56 in one
    // place and 1,234.56 in another. Neither is a Money.
    expect(money.toMoney("1234.5", 2)).toBe("1234.50");
    expect(money.toMoney("1234.5", 2)).not.toContain(",");
  });
});
