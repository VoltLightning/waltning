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
import { Decimal as GlobalDecimal } from "decimal.js";

/**
 * A **private** Decimal constructor, not the global one.
 *
 * `Decimal.set(...)` mutates decimal.js's global configuration for the whole
 * process. Any other module — ours, a dependency, a transitive dependency —
 * calling `Decimal.set` would silently change the rounding mode of every
 * amount in the ledger, from anywhere, with nothing to detect it. `clone()`
 * gives this module a constructor whose configuration cannot be reached from
 * outside it.
 *
 * 28 significant digits comfortably covers 8-dp crypto balances.
 *
 * **ROUND_HALF_UP is a decision, recorded in `computations.md` §0a.** It is
 * not decimal.js's business default being accepted by omission: half-up and
 * half-even differ systematically over a five-year ledger, and two people
 * implementing from a spec that omits it would write different code.
 */
const Decimal = GlobalDecimal.clone({ precision: 28, rounding: GlobalDecimal.ROUND_HALF_UP });

/** The instance type. `Decimal` above is a value; a clone does not carry one. */
type Decimal = GlobalDecimal;

declare const MONEY: unique symbol;

/**
 * A decimal amount, as a string — and **a brand, not an alias**.
 *
 * It was `type Money = string`, which documented the intent and enforced none
 * of it: `add(payee, note)` compiled, in a ledger. Every argument this file
 * makes about rounding modes and half-up-versus-half-even was defended by a
 * type that permitted passing a note where an amount goes.
 *
 * The brand is a phantom property that exists only in the type system —
 * `erasableSyntaxOnly` is on, and this compiles to nothing. At run time a
 * `Money` is exactly the string it always was.
 *
 * **`toMoney` is the constructor.** A raw string becomes `Money` by being
 * parsed and re-serialised at a known scale, which is also the only way to know
 * it *is* an amount rather than a word.
 */
export type Money = string & { readonly [MONEY]: "Money" };

/**
 * Parse anything numeric into a Decimal.
 *
 * **Takes a raw `string`, deliberately.** This is the boundary where an amount
 * arrives from outside the type system — a driver, a request body, a literal in
 * a test — and `Decimal` throws on anything that is not a number. Refusing raw
 * strings here would leave callers with no way in at all, and they would reach
 * for a cast, which is the same hole with no validation attached.
 */
export const dec = (v: Money | string | number | Decimal): Decimal => new Decimal(v);

/**
 * Serialize for storage: fixed scale, no exponent notation.
 *
 * **This is `Money`'s constructor**, and the only one. Unbranded in, branded
 * out: a raw string goes through `Decimal`, which throws if it is not a number,
 * and comes back at a known scale. So the brand is never merely asserted —
 * every `Money` in the system has been parsed at least once.
 */
export const toMoney = (v: Decimal | Money | string | number, scale = 8): Money =>
  dec(v).toFixed(scale) as Money;

export const add = (a: Money, b: Money): Money => toMoney(dec(a).plus(b));
export const sub = (a: Money, b: Money): Money => toMoney(dec(a).minus(b));
export const mul = (a: Money, b: Money | number): Money => toMoney(dec(a).times(b));
export const neg = (a: Money): Money => toMoney(dec(a).negated());
export const abs = (a: Money): Money => toMoney(dec(a).abs());

export const sum = (xs: Money[]): Money =>
  toMoney(xs.reduce((acc, x) => acc.plus(x), new Decimal(0)));

export const eq = (a: Money, b: Money): boolean => dec(a).eq(b);
export const isZero = (a: Money): boolean => dec(a).isZero();
export const cmp = (a: Money, b: Money): -1 | 0 | 1 => dec(a).cmp(b) as -1 | 0 | 1;

/**
 * Convert a local amount into the pivot currency. There is no reporting
 * currency to convert into — display currency is a client preference applied
 * at render time (§7.0).
 *
 * `rate` is quoted as: 1 unit of the local currency = `rate` units of pivot.
 */
/* ── FX rates, and the direction that has already cost 14.1× ─────────────── */

declare const RATE: unique symbol;

/**
 * A rate you **multiply** by to reach the pivot.
 *
 * `computations.md` §4: *"`transactions.fx_rate` stores pivot per unit"*, and
 * `amount_pivot` is generated as `amount_original × fx_rate`.
 */
export type PivotPerUnit = string & { readonly [RATE]: "PivotPerUnit" };

/**
 * A rate you **divide** by to reach the pivot. The reciprocal of the above.
 *
 * §4: `to_pivot(x, ccy, date) = x ÷ rate(pivot, ccy, date)`. This is what
 * `fx_rates.rate` stores.
 *
 * **The two are reciprocals and both are called *rate*.** §4 says so in as many
 * words and asks readers to "name variables accordingly" — which is a request
 * for vigilance, and vigilance is what produced a **14.1× error** (H21). These
 * are separate types so the request becomes a compile error instead.
 */
export type UnitsPerPivot = string & { readonly [RATE]: "UnitsPerPivot" };

/** Either direction, for the few places that genuinely do not care (storage, display). */
export type Rate = PivotPerUnit | UnitsPerPivot;

/** Parse a rate stated as pivot per unit — multiply by it. */
export const pivotPerUnit = (v: string | number | Decimal): PivotPerUnit =>
  dec(v).toFixed(12) as PivotPerUnit;

/** Parse a rate stated as units per pivot — divide by it. */
export const unitsPerPivot = (v: string | number | Decimal): UnitsPerPivot =>
  dec(v).toFixed(12) as UnitsPerPivot;

/**
 * Cross between the two directions.
 *
 * **The only legal way across**, and deliberately a named function rather than
 * an inline `1 / x`. Every reciprocal in the system is now one greppable call,
 * so the question "where do we flip a rate?" has an answer.
 *
 * **Flip at most once, at a boundary, and store the result.** A rate lives at
 * `numeric(24,12)`, so the reciprocal is truncated to twelve places and
 * flipping back cannot recover what truncation removed — 4.0231 returns as
 * 4.023099999996. Invisible on a screen and cumulative in a pipeline;
 * `money.test.ts` pins it.
 */
export function reciprocal(rate: PivotPerUnit): UnitsPerPivot;
export function reciprocal(rate: UnitsPerPivot): PivotPerUnit;
export function reciprocal(rate: Rate): Rate {
  return new Decimal(1).dividedBy(rate).toFixed(12) as Rate;
}

/**
 * Convert an amount to the pivot.
 *
 * Takes `PivotPerUnit` **only**. It used to take `Money` for the rate, so the
 * two arguments were the same type and `toPivot(rate, amount)` compiled — in
 * the function that produces the most-read figure in the system.
 */
export const toPivot = (amount: Money, rate: PivotPerUnit): Money =>
  toMoney(dec(amount).times(rate));

/** Convert an amount to the pivot from the other direction — divide, not multiply. */
export const toPivotByDivision = (amount: Money, rate: UnitsPerPivot): Money =>
  toMoney(dec(amount).dividedBy(rate));

/** Round to a currency's presentation scale — display only, never storage. */
export const round = (v: Money, decimals: number): Money => dec(v).toFixed(decimals) as Money;

export type TxnType = "income" | "expense" | "transfer" | "adjustment";

/**
 * Signed value for balance math. Storage keeps every amount positive and lets
 * `type` carry direction, matching the import format and removing a whole
 * class of sign-flip bug.
 *
 * Takes BOTH amounts, because a cross-currency transfer has two that differ
 * (§7.5). A signature taking one cannot express a transfer at all: asking it
 * for the destination leg would return the source amount, which is the single
 * easiest way to corrupt a balance.
 */
export const signed = (
  tx: { type: TxnType; amountOriginal: Money; toAmount?: Money | null },
  side: "from" | "to" = "from",
): Money => {
  switch (tx.type) {
    case "income":
    case "adjustment":
      return tx.amountOriginal;
    case "expense":
      return neg(tx.amountOriginal);
    case "transfer":
      if (side === "from") return neg(tx.amountOriginal);
      if (tx.toAmount == null) {
        throw new Error("transfer destination leg requires toAmount — see SPEC.md §7.2");
      }
      return tx.toAmount;
  }
};

/**
 * Effect on a counterparty's debt balance. Exactly the negation of the cash
 * flow: lending (cash −200) is a receivable of +200, being repaid (+200) is
 * −200, borrowing (+200) is −200, repaying (−200) is +200 (§6.6).
 *
 * The ledger signs by cash flow; a debt balance signs by obligation. Nothing
 * else in the system inverts, which is why this is its own function rather
 * than a flag on `signed`.
 *
 * **`side` is required and is not always `from`.** §6.4 makes the clearing
 * account 636 transfers of 678 rows, and §6.6 collapses the loan accounts into
 * counterparties — so a repayment is naturally a transfer INTO your bank, whose
 * counterparty sits on the `to` leg. Defaulting to `from` inverted the sign on
 * every debt recorded as a transfer: being repaid 200 moved the balance from
 * +200 to +400.
 */
export const debtDelta = (
  tx: { type: TxnType; amountOriginal: Money; toAmount?: Money | null },
  side: "from" | "to",
): Money => neg(signed(tx, side));

export { Decimal };
