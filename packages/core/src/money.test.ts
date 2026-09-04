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
    expect(money.add(money.toMoney("0.10000000"), money.toMoney("0.20000000"))).toBe("0.30000000");
  });

  it("stays exact well past 8 decimal places of magnitude", () => {
    expect(money.add(money.toMoney("99999999999.99999999"), money.toMoney("0.00000001"))).toBe(
      "100000000000.00000000",
    );
  });

  it("sums an empty ledger to zero rather than throwing", () => {
    expect(money.sum([])).toBe("0.00000000");
  });

  it("sums a large batch without drift", () => {
    const cents = Array.from({ length: 10_000 }, () => money.toMoney("0.01"));
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
    expect(money.sub(money.toMoney("1.00000000"), money.toMoney("1.00000000"))).toBe("0.00000000");
    expect(money.neg(money.toMoney("0.00000000"))).toBe("0.00000000");
    expect(money.isZero(money.toMoney("-0.00000000"))).toBe(true);
    expect(money.cmp(money.toMoney("-0.00000000"), money.toMoney("0.00000000"))).toBe(0);
  });

  it("keeps sign through abs and neg", () => {
    expect(money.abs(money.toMoney("-42.50000000"))).toBe("42.50000000");
    expect(money.neg(money.toMoney("-42.50000000"))).toBe("42.50000000");
  });
});

describe("representation", () => {
  it("never emits exponent notation, however small or large", () => {
    // Fixed-notation input only — `toFixed()` never emits exponent notation
    // on the way out regardless of magnitude, so this is the *output*
    // guarantee. Exponent-notation *input* is its own refusal, below.
    for (const v of ["0.00000001", "12345678901234567890.12345678"]) {
      expect(money.toMoney(v)).not.toMatch(/e/i);
    }
  });

  it("is locale-independent — the phone and the server must agree", () => {
    // A `toLocaleString` anywhere in this path would render 1 234,56 in one
    // place and 1,234.56 in another. Neither is a Money.
    expect(money.toMoney("1234.5", 2)).toBe("1234.50");
    expect(money.toMoney("1234.5", 2)).not.toContain(",");
  });

  /**
   * L2 — `zMoney`'s own regex (`^-?\d+(\.\d+)?$`) already refuses exponent
   * notation; `toMoney` used to be laxer about the same "decimal string"
   * concept when reached directly (`createTransaction`'s controller does,
   * on `draft.amount`, before any schema sees it) — `toMoney("1e3")`
   * silently returned `"1000.00000000"`.
   */
  it("refuses exponent notation rather than silently normalising it", () => {
    for (const v of ["1e3", "1E3", "1e-8", "1e21", "-1e3"]) {
      expect(() => money.toMoney(v)).toThrow();
    }
  });
});

describe("the two rates are reciprocals, and the types know it (H21)", () => {
  /**
   * `computations.md` §4: *"The two are reciprocals and both are called rate;
   * treat that as a known hazard and name variables accordingly."*
   *
   * Naming variables accordingly is a request for vigilance, and vigilance is
   * what produced a **14.1× error**. These assert the arithmetic; the types
   * assert the rest, and `rate.type-test.ts` proves the swap does not compile.
   */
  it("dividing by one equals multiplying by the other", () => {
    const stored = money.unitsPerPivot("3.81"); // PLN per 1 USD, as `fx_rates` holds it
    const flipped = money.reciprocal(stored); //   USD per 1 PLN, as a transaction holds it

    const amount = money.toMoney("100");
    expect(money.toPivotByDivision(amount, stored)).toBe(money.toPivot(amount, flipped));
  });

  /**
   * **Flipping twice does not return the original, and that is not a bug.**
   *
   * A rate is stored at `numeric(24,12)` (§7.6), so a reciprocal is truncated
   * to twelve places and flipping it back cannot recover what truncation
   * removed: 4.0231 returns as 4.023099999996.
   *
   * It is pinned because the number is small enough to be invisible and the
   * conclusion is not: **flip at most once, at a boundary, and store the
   * result.** A pipeline that flips back and forth accumulates this.
   */
  it("flipping twice is lossy at the stored scale", () => {
    const stored = money.unitsPerPivot("4.0231");
    const back = money.reciprocal(money.reciprocal(stored));

    expect(back).not.toBe(stored);
    expect(Math.abs(Number(back) - Number(stored))).toBeLessThan(1e-9);
  });

  /**
   * The failure H21 actually was: the wrong direction applied, silently, to a
   * figure that still looks like money. At 3.81 the two answers differ by
   * 14.5× — which is the order of magnitude the defect register recorded.
   */
  it("using the wrong direction is off by more than an order of magnitude", () => {
    const stored = money.unitsPerPivot("3.81");
    const right = money.toPivotByDivision(money.toMoney("100"), stored);
    const wrong = money.toPivot(money.toMoney("100"), money.pivotPerUnit(stored));

    const ratio = Number(wrong) / Number(right);
    expect(ratio).toBeGreaterThan(14);
  });
});

describe("forDisplay — the reading form", () => {
  const NBSP = " ";

  it("groups the integer part in threes", () => {
    expect(money.forDisplay(money.toMoney("48210.00"), 2)).toBe(`48${NBSP}210.00`);
    expect(money.forDisplay(money.toMoney("1234567.89"), 2)).toBe(`1${NBSP}234${NBSP}567.89`);
    expect(money.forDisplay(money.toMoney("999.99"), 2)).toBe("999.99");
    expect(money.forDisplay(money.toMoney("1000"), 2)).toBe(`1${NBSP}000.00`);
  });

  it("groups behind the sign, not in front of it", () => {
    // `-1 200.00`, never `- 1200.00` and never a group inserted before the
    // minus, which is what a naive three-from-the-right pass does.
    expect(money.forDisplay(money.toMoney("-1200.00"), 2)).toBe(`-1${NBSP}200.00`);
  });

  it("never groups the fraction", () => {
    // A rate's scale is not a quantity; grouping it reads as a phone number.
    expect(money.forDisplay(money.toMoney("1.12345678"), 8)).toBe("1.12345678");
  });

  it("honours a currency with no minor unit", () => {
    expect(money.forDisplay(money.toMoney("125000"), 0)).toBe(`125${NBSP}000`);
  });

  /**
   * **The separator does not wrap.** A plain space would let `48 210.00` break
   * across two lines at the end of a row, which reads as two figures.
   */
  it("separates with a no-break space", () => {
    expect(money.forDisplay(money.toMoney("48210"), 2)).not.toContain("\u0020");
  });

  /**
   * The display form is a `string`, and that is the guarantee: it can never be
   * handed back to arithmetic or written to the wire. This asserts the property
   * a type cannot — that the grouped text is not parseable as the storage form.
   */
  it("is not round-trippable, deliberately", () => {
    expect(() => money.toMoney(money.forDisplay(money.toMoney("48210.00"), 2))).toThrow();
  });

  /**
   * L2 — a value that rounds to zero renders unsigned. `toFixed` alone keeps
   * the minus from `-0.004`, reading as `-0,00` — a negative sign on a
   * figure a reader sees as nothing.
   */
  it("renders dust that rounds to zero without a minus sign", () => {
    expect(money.forDisplay(money.toMoney("-0.004"), 2)).toBe("0.00");
    expect(money.forDisplay(money.toMoney("0.004"), 2)).toBe("0.00");
    // Still signed once it is a real amount at this scale.
    expect(money.forDisplay(money.toMoney("-0.006"), 2)).toBe("-0.01");
  });
});

describe("§4 — display conversion", () => {
  /**
   * `computations.md` §4's own worked figure: 565.20 PLN at 3.8100 → 148.35
   * USD, rounded at the display boundary. `convert` keeps full precision;
   * `round` is the caller's step.
   */
  it("565.20 PLN at 3.8100 converts to 148.35 USD", () => {
    const plnPerPivot = money.unitsPerPivot("3.8100"); // pivot is USD here
    const usdPerPivot = money.unitsPerPivot("1"); // the pivot converts to itself at 1
    const converted = money.convert(money.toMoney("565.20"), plnPerPivot, usdPerPivot);
    expect(money.round(converted, 2)).toBe("148.35");
  });

  it("is the identity when both rates agree, and the division is exact", () => {
    // A rate chosen so `x ÷ rate` loses nothing at scale 8 — the property
    // holds exactly here; `money.property.test.ts` covers the general,
    // rounding-bounded case for an arbitrary rate.
    const rate = money.unitsPerPivot("4");
    expect(money.convert(money.toMoney("18.00"), rate, rate)).toBe("18.00000000");
  });

  it("from_pivot is from_pivot: p × rate, not p ÷ rate", () => {
    // 100 pivot units at 3 units-per-pivot is 300, never 33.33…
    expect(money.fromPivot(money.toMoney("100.00"), money.unitsPerPivot("3"))).toBe("300.00000000");
  });
});

describe("§4a / §7.5 — FX margin on a transfer", () => {
  /**
   * The exact worked example, both docs: 150.00 USD → 565.20 PLN, reference
   * 3.8100 (PLN per pivot), pivot USD → margin 1.65 USD, 1.10%.
   */
  it("150.00 USD → 565.20 PLN at a 3.8100 reference rate costs 1.65 USD, 1.10%", () => {
    const result = money.margin({
      amountOriginal: money.toMoney("150.00"),
      fxRate: money.pivotPerUnit("1"), // USD is the pivot: 1 pivot per unit
      toAmount: money.toMoney("565.20"),
      // The reference rate for PLN, in the same pivot-per-unit direction as
      // `fxRate` — the reciprocal of §4's 3.8100 units-per-pivot.
      toFxRate: money.reciprocal(money.unitsPerPivot("3.8100")),
    });
    // Full precision throughout (`toPivotByDivision`'s own rule); the
    // worked figure is the *displayed* result, rounded at the boundary.
    expect(money.round(result.marginPivot, 2)).toBe("1.65");
    // marginPct is the plain ratio §4a defines — margin ÷ amount_pivot —
    // not pre-multiplied by 100; a screen renders the percentage.
    expect(money.round(money.mul(result.marginPct, 100), 2)).toBe("1.10");
    expect(result.realizedRate).toBe(money.toMoney(money.dec("565.20").dividedBy("150.00")));
  });

  it("is negative, and unclamped, when the transfer beat the reference rate", () => {
    // The reference values the destination *lower* than what actually
    // arrived — beating the rate — so the margin must render negative.
    const result = money.margin({
      amountOriginal: money.toMoney("100.00"),
      fxRate: money.pivotPerUnit("1"),
      toAmount: money.toMoney("420.00"),
      toFxRate: money.pivotPerUnit("0.25"), // reference: 420 × 0.25 = 105 pivot, more than 100
    });
    expect(money.dec(result.marginPivot).isNegative()).toBe(true);
    expect(result.marginPivot).toBe("-5.00000000");
  });

  it("is exactly 1 for a same-currency transfer", () => {
    const result = money.margin({
      amountOriginal: money.toMoney("100.00"),
      fxRate: money.pivotPerUnit("1"),
      toAmount: money.toMoney("100.00"),
      toFxRate: money.pivotPerUnit("1"),
    });
    expect(result.marginPivot).toBe("0.00000000");
    expect(result.realizedRate).toBe("1.00000000");
  });
});

/** H2 — a residual that rounds to zero at the currency's own scale reads as settled, never a direction. */
describe("debtDirection — rounded to the currency's own scale (H2)", () => {
  it("reads sub-minor-unit dust as settled, not a direction", () => {
    expect(money.debtDirection(money.toMoney("0.00000001"), 2)).toBe("settled");
    expect(money.debtDirection(money.toMoney("-0.00000001"), 2)).toBe("settled");
  });

  it("still reads a real balance in either direction", () => {
    expect(money.debtDirection(money.toMoney("120.50"), 2)).toBe("theyOwe");
    expect(money.debtDirection(money.toMoney("-120.50"), 2)).toBe("youOwe");
  });

  it("rounds at the currency's own scale, not a fixed one — a JPY (0dp) residual under 0.5 is settled", () => {
    expect(money.debtDirection(money.toMoney("0.4"), 0)).toBe("settled");
    expect(money.debtDirection(money.toMoney("0.6"), 0)).toBe("theyOwe");
  });
});

describe("directionTotals — dust at scale (H2, H4)", () => {
  it("omits a currency whose totals both round to zero at its own scale", () => {
    const rows = [
      { currency: money.currencyCode("PLN"), balance: money.toMoney("0.00000001"), decimals: 2 },
      { currency: money.currencyCode("PLN"), balance: money.toMoney("-0.00000001"), decimals: 2 },
    ];
    expect(money.directionTotals(rows)).toEqual([]);
  });

  it("carries decimals on every row it returns (H4)", () => {
    const rows = [
      { currency: money.currencyCode("JPY"), balance: money.toMoney("500"), decimals: 0 },
    ];
    expect(money.directionTotals(rows)).toEqual([
      {
        currency: "JPY",
        theyOwe: money.toMoney("500"),
        youOwe: money.toMoney("0"),
        decimals: 0,
      },
    ]);
  });

  /**
   * M1 — the total is the sum of what the rows show, never a full-precision
   * sum rounded only at the end. Three counterparties at +0.004 PLN each
   * round to 0,00 individually (settled) — summing the raw 8dp balances
   * first gives 0.012, which rounds to a header of 0,01 while every row
   * reads settled and the segment lists nobody.
   */
  it("rounds each balance to its own scale before summing (M1)", () => {
    const rows = [
      { currency: money.currencyCode("PLN"), balance: money.toMoney("0.004"), decimals: 2 },
      { currency: money.currencyCode("PLN"), balance: money.toMoney("0.004"), decimals: 2 },
      { currency: money.currencyCode("PLN"), balance: money.toMoney("0.004"), decimals: 2 },
    ];
    expect(money.directionTotals(rows)).toEqual([]);
  });

  /**
   * L4 — two rows of the same currency disagreeing on `decimals` is a wrong
   * scale, never silently resolved by picking whichever row's own `decimals`
   * happened to set the bucket first (H3's own lesson, applied here too).
   */
  it("throws when two rows of one currency disagree on decimals (L4)", () => {
    const rows = [
      { currency: money.currencyCode("PLN"), balance: money.toMoney("10"), decimals: 2 },
      { currency: money.currencyCode("PLN"), balance: money.toMoney("5"), decimals: 0 },
    ];
    expect(() => money.directionTotals(rows)).toThrow(/decimals/);
  });
});
