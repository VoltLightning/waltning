/**
 * Money arithmetic.
 *
 * Amounts cross the wire and the driver boundary as decimal *strings*, never
 * as JS numbers — `0.1 + 0.2` is the wrong answer in a ledger, and a five-year
 * history compounds it. `postgres.js` returns `numeric` as a string already,
 * so the string form is the natural representation end to end.
 */

// Named import, not default: under NodeNext the default export resolves to
// decimal.js's namespace declaration rather than the constructable class.
import { Decimal } from "decimal.js";

// 28 significant digits comfortably covers 8-dp crypto balances.
Decimal.set({ precision: 28, rounding: Decimal.ROUND_HALF_UP });

export type Money = string;

export const dec = (v: Money | number | Decimal): Decimal => new Decimal(v);

/** Serialize for storage: fixed scale, no exponent notation. */
export const toMoney = (v: Decimal | Money | number, scale = 8): Money =>
  dec(v).toFixed(scale);

export const add = (a: Money, b: Money): Money => toMoney(dec(a).plus(b));
export const sub = (a: Money, b: Money): Money => toMoney(dec(a).minus(b));
export const mul = (a: Money, b: Money | number): Money =>
  toMoney(dec(a).times(b));
export const neg = (a: Money): Money => toMoney(dec(a).negated());
export const abs = (a: Money): Money => toMoney(dec(a).abs());

export const sum = (xs: Money[]): Money =>
  toMoney(xs.reduce((acc, x) => acc.plus(x), new Decimal(0)));

export const eq = (a: Money, b: Money): boolean => dec(a).eq(b);
export const isZero = (a: Money): boolean => dec(a).isZero();
export const cmp = (a: Money, b: Money): -1 | 0 | 1 =>
  dec(a).cmp(b) as -1 | 0 | 1;

/**
 * Convert a local amount into the reporting currency.
 * `rate` is quoted as: 1 unit of the local currency = `rate` units of main.
 */
export const toMain = (amount: Money, rate: Money): Money =>
  toMoney(dec(amount).times(rate));

/** Round to a currency's presentation scale — display only, never storage. */
export const round = (v: Money, decimals: number): Money =>
  dec(v).toFixed(decimals);

/**
 * Signed value for balance math. Storage keeps every amount positive and lets
 * `type` carry direction, matching the import format and removing a whole
 * class of sign-flip bug.
 */
export const signed = (
  amount: Money,
  type: "income" | "expense" | "transfer" | "adjustment",
  side: "from" | "to" = "from",
): Money => {
  switch (type) {
    case "income":
      return amount;
    case "expense":
      return neg(amount);
    case "adjustment":
      return amount;
    case "transfer":
      return side === "from" ? neg(amount) : amount;
  }
};

export { Decimal };
