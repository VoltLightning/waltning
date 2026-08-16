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

export type Money = string;

export const dec = (v: Money | number | Decimal): Decimal => new Decimal(v);

/** Serialize for storage: fixed scale, no exponent notation. */
export const toMoney = (v: Decimal | Money | number, scale = 8): Money => dec(v).toFixed(scale);

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
export const toPivot = (amount: Money, rate: Money): Money => toMoney(dec(amount).times(rate));

/** Round to a currency's presentation scale — display only, never storage. */
export const round = (v: Money, decimals: number): Money => dec(v).toFixed(decimals);

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
