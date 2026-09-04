/**
 * Money arithmetic, for every input rather than the ones someone thought of.
 *
 * The four properties the board card names: `signed` on both legs,
 * `debtDelta(tx, side) = −signed(tx, side)` on both sides, decimal round-trips
 * lossless at scale 8, and no path through a JS number. The last is the one
 * only a property test can make: any single example that survives `Number`
 * looks fine; the generator finds the 17th significant digit.
 */

import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { accountingDate } from "./date.ts";
import * as money from "./money.ts";

/** A scale-8 decimal string, up to numeric(20,8): 12 integer digits, 8 fractional. */
const moneyArb = fc
  .tuple(fc.bigInt({ min: 0n, max: 999_999_999_999n }), fc.bigInt({ min: 0n, max: 99_999_999n }))
  .map(([whole, frac]) => money.toMoney(`${whole}.${frac.toString().padStart(8, "0")}`));

const positiveMoneyArb = moneyArb.filter((m) => !money.isZero(m));

/**
 * A `UnitsPerPivot` rate at `numeric(24,12)` scale — `fx_rates`' own
 * direction. `min: 1n` on the whole part keeps it strictly positive, so
 * `convert`'s division never sees a zero divisor.
 */
const rateArb = fc
  .tuple(fc.bigInt({ min: 1n, max: 999_999n }), fc.bigInt({ min: 0n, max: 999_999_999_999n }))
  .map(([whole, frac]) => money.unitsPerPivot(`${whole}.${frac.toString().padStart(12, "0")}`));

const txArb = fc.record({
  type: fc.constantFrom(
    "income",
    "expense",
    "transfer",
    "adjustment",
  ) as fc.Arbitrary<money.TxnType>,
  amountOriginal: positiveMoneyArb,
  toAmount: positiveMoneyArb,
});

describe("money, for every input", () => {
  it("round-trips a scale-8 string losslessly", () => {
    // Block body, deliberately: vitest v4's `expect(...).toBe(...)` returns a
    // chainable `Assertion`, not `undefined` — fast-check's Property.run treats
    // any predicate return that is neither `undefined` nor `true` as a failure
    // ("Property failed by returning false"), so a concise arrow body here
    // reports every passing case as a false negative regardless of the
    // assertion's own outcome.
    fc.assert(
      fc.property(moneyArb, (m) => {
        expect(money.toMoney(money.dec(m))).toBe(m);
      }),
    );
  });

  it("never passes an amount through a JS number", () => {
    // 0.1 + 0.2 is the canonical float failure — concrete, not generated,
    // because it demonstrates the JS-number path actually diverges rather
    // than merely being absent from money.ts's own computation.
    expect(Number(money.toMoney("0.1")) + Number(money.toMoney("0.2"))).not.toBe(0.3);
    expect(money.add(money.toMoney("0.1"), money.toMoney("0.2"))).toBe("0.30000000");

    // The property: for any two operands, add() equals the exact decimal
    // sum — recomputed independently here — which a float path could not
    // reproduce past 15 significant digits.
    //
    // (An earlier version of this property also asserted that money.add and
    // a float-based recomputation must *disagree* unless an operand was
    // below an arbitrary threshold. That is unsound per-input: for
    // a = "1000000.00000000", b = "0.00000000" — a round number a float
    // represents exactly, and not "< 1e6" since it's equal to it — the two
    // paths legitimately agree, so the property returned false on a
    // perfectly valid pair. Dropped in favour of the concrete example above,
    // which makes the same point without depending on the generator landing
    // outside float precision.)
    fc.assert(
      fc.property(moneyArb, moneyArb, (a, b) => {
        const exact = money.toMoney(money.dec(a).plus(money.dec(b)));
        expect(money.add(a, b)).toBe(exact);
      }),
    );
  });

  it("signs the source leg by type and the destination leg as toAmount", () => {
    fc.assert(
      fc.property(txArb, (tx) => {
        const from = money.signed(tx, "from");
        switch (tx.type) {
          case "income":
          case "adjustment":
            expect(from).toBe(tx.amountOriginal);
            break;
          case "expense":
            expect(from).toBe(money.neg(tx.amountOriginal));
            break;
          case "transfer":
            expect(from).toBe(money.neg(tx.amountOriginal));
            expect(money.signed(tx, "to")).toBe(tx.toAmount);
            break;
        }
      }),
    );
  });

  it("debtDelta is exactly −signed on both sides", () => {
    fc.assert(
      fc.property(
        txArb,
        fc.constantFrom("from", "to") as fc.Arbitrary<"from" | "to">,
        (tx, side) => {
          if (side === "to" && tx.type !== "transfer") return; // signed throws by design; §1
          expect(money.debtDelta(tx, side)).toBe(money.neg(money.signed(tx, side)));
        },
      ),
    );
  });

  it("rounds half away from zero at scale 8, in both signs", () => {
    expect(money.round(money.toMoney("1.000000005"), 8)).toBe("1.00000001");
    expect(money.round(money.toMoney("-1.000000005"), 8)).toBe("-1.00000001");
  });

  /**
   * §4 — `convert(convert(x, a, b), b, a)` returns to `x`, within the
   * rounding `toMoney`'s scale-8 storage introduces at each of the four
   * divisions and multiplications the round trip performs. Not asserted as
   * bit-exact: `toPivotByDivision`/`fromPivot` each round to 8 places, and a
   * rate that does not divide evenly loses a fraction of the last place —
   * `money.test.ts`'s "is the identity" case is the exact special case, this
   * is the general, bounded one.
   *
   * **The bound scales with the rates, not a fixed epsilon.** Each of the
   * four steps can round by up to half a unit at scale 8, and a
   * multiplication by `a` or `b` carries an earlier step's rounding forward
   * scaled by that rate — so the tolerance is `(a + b + 1) × 5e-8`, twice the
   * per-step error, which is generous enough to hold for every generated
   * pair and still tight enough that a reciprocal-flip bug (H21 — off by the
   * *square* of the rate, not a multiple of it) fails it by orders of
   * magnitude.
   */
  it("round-trips convert(x, a, b) then convert(·, b, a), within a rate-scaled bound", () => {
    fc.assert(
      fc.property(positiveMoneyArb, rateArb, rateArb, (x, a, b) => {
        const there = money.convert(x, a, b);
        const back = money.convert(there, b, a);
        const drift = money.dec(back).minus(x).abs();
        const tolerance = money.dec(a).plus(b).plus(1).times("0.00000005");
        expect(drift.lte(tolerance)).toBe(true);
      }),
    );
  });

  it("convert(x, r, r) is the identity when the division loses nothing", () => {
    // `r = 1` never rounds either step, for any x — the general-rate case
    // above bounds the rest.
    fc.assert(
      fc.property(moneyArb, (x) => {
        const one = money.unitsPerPivot("1");
        expect(money.convert(x, one, one)).toBe(x);
      }),
    );
  });
});

/**
 * §7 ageing and §8 attribution share one algorithm (`fifoOldestOpen`); §8's
 * allocation is a second, unrelated one (`allocateLargestRemainder`). Same
 * shape of property either way: an assertion that does not reimplement the
 * function under test, so a bug in the implementation cannot also be a bug
 * in the check.
 */
describe("fifoOldestOpen — for every input", () => {
  const idArb = fc.stringMatching(/^[a-z]{1,4}$/);

  it("a zero balance returns null — deltas built to sum to exactly zero", () => {
    fc.assert(
      fc.property(
        fc.uniqueArray(idArb, { minLength: 1, maxLength: 6 }),
        fc.array(fc.bigInt({ min: -999_999n, max: 999_999n }), { minLength: 1, maxLength: 6 }),
        (ids, magnitudes) => {
          const rows = ids.map((id, i) => ({
            id,
            date: accountingDate(`2026-08-${String((i % 28) + 1).padStart(2, "0")}`),
            delta: money.toMoney((magnitudes[i % magnitudes.length] ?? 0n).toString()),
          }));
          const total = rows.reduce((acc, r) => acc.plus(money.dec(r.delta)), money.dec(0));
          // A last row that exactly cancels the rest — the fixture, not the
          // property, forces the zero balance.
          const balancing = {
            id: "zzzzzz",
            date: accountingDate("2026-08-28"),
            delta: money.toMoney(total.negated()),
          };
          expect(money.fifoOldestOpen([...rows, balancing])).toBeNull();
        },
      ),
    );
  });

  it("never returns an id absent from its own input, and never for a zero balance", () => {
    fc.assert(
      fc.property(
        fc.uniqueArray(idArb, { minLength: 1, maxLength: 6 }),
        fc.array(
          fc.bigInt({ min: -999_999n, max: 999_999n }).filter((n) => n !== 0n),
          {
            minLength: 1,
            maxLength: 6,
          },
        ),
        (ids, magnitudes) => {
          const rows = ids.map((id, i) => ({
            id,
            date: accountingDate(`2026-08-${String((i % 28) + 1).padStart(2, "0")}`),
            delta: money.toMoney((magnitudes[i % magnitudes.length] ?? 1n).toString()),
          }));
          const result = money.fifoOldestOpen(rows);
          if (money.dec(rows.reduce((a, r) => a.plus(money.dec(r.delta)), money.dec(0))).isZero()) {
            expect(result).toBeNull();
          } else {
            expect(result).not.toBeNull();
            expect(rows.some((r) => r.id === result?.id && r.date === result.date)).toBe(true);
          }
        },
      ),
    );
  });

  it("is stable by (date, id) — the answer does not depend on input array order", () => {
    fc.assert(
      fc.property(
        fc.uniqueArray(idArb, { minLength: 2, maxLength: 6 }),
        fc.array(
          fc.bigInt({ min: -999_999n, max: 999_999n }).filter((n) => n !== 0n),
          {
            minLength: 2,
            maxLength: 6,
          },
        ),
        fc.integer({ min: 0, max: 2 ** 31 - 1 }),
        (ids, magnitudes, seed) => {
          const rows = ids.map((id, i) => ({
            id,
            date: accountingDate(`2026-08-${String((i % 5) + 1).padStart(2, "0")}`),
            delta: money.toMoney((magnitudes[i % magnitudes.length] ?? 1n).toString()),
          }));
          // A deterministic shuffle from the seed — array order must not
          // matter; only (date, id) may.
          const shuffled = [...rows]
            .map((row, i) => ({ row, key: (i * 2654435761 + seed) >>> 0 }))
            .sort((a, b) => a.key - b.key)
            .map(({ row }) => row);
          expect(money.fifoOldestOpen(shuffled)).toEqual(money.fifoOldestOpen(rows));
        },
      ),
    );
  });
});

describe("allocateLargestRemainder — for every input", () => {
  it("always sums back to the total, at any scale and any weights", () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 0, max: 8 }),
        fc.array(fc.integer({ min: 1, max: 1000 }), { minLength: 1, maxLength: 8 }),
        fc.bigInt({ min: 0n, max: 999_999_999n }),
        (decimals, weights, wholeUnits) => {
          // A total already at the currency's own scale — realistic input,
          // and the precondition the implementation itself documents.
          const total = money.toMoney(money.dec(wholeUnits.toString()).dividedBy(10 ** decimals));
          const shares = money.allocateLargestRemainder(total, weights, decimals);
          expect(shares).toHaveLength(weights.length);
          expect(money.sum([...shares])).toBe(total);
        },
      ),
    );
  });

  it("every share is a non-negative multiple of the currency's own minor unit", () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 0, max: 4 }),
        fc.array(fc.integer({ min: 1, max: 100 }), { minLength: 1, maxLength: 5 }),
        fc.bigInt({ min: 0n, max: 99_999n }),
        (decimals, weights, wholeUnits) => {
          const total = money.toMoney(money.dec(wholeUnits.toString()).dividedBy(10 ** decimals));
          for (const share of money.allocateLargestRemainder(total, weights, decimals)) {
            expect(money.dec(share).isNegative()).toBe(false);
            const units = money.dec(share).times(10 ** decimals);
            expect(units.toDecimalPlaces(0).eq(units)).toBe(true);
          }
        },
      ),
    );
  });
});

describe("debtDirection — for every input (H2)", () => {
  it("is 'settled' whenever the balance rounds to zero at the given scale", () => {
    fc.assert(
      fc.property(fc.integer({ min: 0, max: 8 }), moneyArb, (decimals, balance) => {
        const rounded = money.round(balance, decimals);
        const direction = money.debtDirection(balance, decimals);
        expect(money.isZero(rounded) ? direction === "settled" : direction !== "settled").toBe(
          true,
        );
      }),
    );
  });
});
