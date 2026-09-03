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
import * as money from "./money.ts";

/** A scale-8 decimal string, up to numeric(20,8): 12 integer digits, 8 fractional. */
const moneyArb = fc
  .tuple(fc.bigInt({ min: 0n, max: 999_999_999_999n }), fc.bigInt({ min: 0n, max: 99_999_999n }))
  .map(([whole, frac]) => money.toMoney(`${whole}.${frac.toString().padStart(8, "0")}`));

const positiveMoneyArb = moneyArb.filter((m) => !money.isZero(m));

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
});
