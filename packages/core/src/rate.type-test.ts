/**
 * The H21 swap, asserted as a **compile** error.
 *
 * `computations.md` §4 records that `transactions.fx_rate` and `fx_rates.rate`
 * are reciprocals, that both are called *rate*, and that the confusion produced
 * a **14.1× error**. Its instruction is to *"treat that as a known hazard and
 * name variables accordingly"* — a request for vigilance, which is what failed.
 *
 * `money.test.ts` asserts the arithmetic. This asserts the part arithmetic
 * cannot: that the wrong direction no longer typechecks.
 *
 * Type-level, so it costs nothing at run time and fails the gate through `tsc`
 * exactly as `contract.types.ts` does.
 */

import type { CrossRate, Money, PivotPerUnit, toPivot, UnitsPerPivot } from "./money.ts";

type Expect<T extends true> = T;
type Not<T extends boolean> = T extends true ? false : true;
type Extends<A, B> = A extends B ? true : false;

/* ── the two directions are not each other ───────────────────────────────── */

export type PivotPerUnitIsNotUnitsPerPivot = Expect<Not<Extends<PivotPerUnit, UnitsPerPivot>>>;
export type UnitsPerPivotIsNotPivotPerUnit = Expect<Not<Extends<UnitsPerPivot, PivotPerUnit>>>;

/* ── and neither is money ────────────────────────────────────────────────── */

/**
 * The swap H21 actually was. `toPivot(amount, rate)` took two `Money`, so its
 * arguments were interchangeable — in the function that produces the most-read
 * figure in the system.
 */
export type MoneyIsNotARate = Expect<Not<Extends<Money, PivotPerUnit>>>;
export type RateIsNotMoney = Expect<Not<Extends<PivotPerUnit, Money>>>;

/* ── but both are still strings, so they cross the wire untouched ────────── */

export type PivotPerUnitIsAString = Expect<Extends<PivotPerUnit, string>>;
export type UnitsPerPivotIsAString = Expect<Extends<UnitsPerPivot, string>>;

/**
 * Non-vacuous.
 *
 * Every assertion above is satisfied by `never`, so if a brand were ever
 * mistyped into nothing the file would keep passing while proving the opposite.
 * Naming a value of each type is what stops that.
 */
export const inhabited: [PivotPerUnit, UnitsPerPivot] = [
  "0.248564000000" as PivotPerUnit,
  "4.023100000000" as UnitsPerPivot,
];

/* ── M1: a triangulated cross rate is neither direction ──────────────────── */

/**
 * `readCrossRate` triangulates through the pivot and its answer is not a
 * `PivotPerUnit` — multiplying by it does not land on the pivot at all, it
 * lands in whichever currency the cross pair's `to` side names.
 */
export type CrossRateIsNotPivotPerUnit = Expect<Not<Extends<CrossRate, PivotPerUnit>>>;
export type PivotPerUnitIsNotCrossRate = Expect<Not<Extends<PivotPerUnit, CrossRate>>>;

/** `toPivot` takes `PivotPerUnit` only — a `CrossRate` must not typecheck there. */
export type ToPivotRefusesCrossRate = Expect<
  Not<Extends<CrossRate, Parameters<typeof toPivot>[1]>>
>;

export const crossRateInhabited: CrossRate = "3.810000000000" as CrossRate;
