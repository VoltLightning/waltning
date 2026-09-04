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
import type { AccountingDate } from "./date.ts";
import { daysBetween } from "./date.ts";

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

/**
 * The additive identity, at storage scale — a fallback figure for a screen
 * that has nothing to show yet, never a placeholder standing in for "no
 * data." A constant rather than a call: `tests/architecture.test.ts` bans
 * `money.toMoney(` outside `packages/ui` (a figure built by hand rather than
 * through `<Amount>`), and every call site that needs a zero to render is
 * exactly the case that rule exists for.
 */
export const ZERO: Money = toMoney("0");

/**
 * The group separator: **U+00A0, a no-break space.**
 *
 * Not a comma, and not chosen by locale. `design-system/04` §4.1 draws the
 * figure as `1 234,56 zł`, which is Polish convention — but the app renders a
 * trailing ISO code (`PLN`), not a symbol, and `screens/S17` records that
 * symbol placement is a locale question nobody has answered yet. A comma group
 * with a dot decimal is the one combination that is ambiguous in *both* the
 * conventions this product will meet; a space group is unambiguous in both.
 *
 * No-break rather than a thin space, for two reasons: a thin space is not
 * guaranteed to exist in every fallback face, and a plain space would let a
 * figure wrap in the middle of itself at the end of a row.
 */
const GROUP = "\u00a0";

/**
 * A figure as a person reads it — grouped thousands, fixed decimals.
 *
 * **Not `toMoney`.** That is the storage form: full scale, ungrouped,
 * round-trippable, and the only thing that may ever be written down or sent.
 * This is the display form, and it is deliberately a *different function with
 * a different return type* — a `string`, not a `Money` — so a figure formatted
 * for a screen can never be handed back to arithmetic or to the wire.
 *
 * It exists because a ledger without grouping is a ledger you count digits in:
 * `12480.20` and `1248.02` are one glance apart, and the total on the phone's
 * home screen read `48210.00` for the whole life of the design system.
 *
 * Grouping runs on the integer part only. The fraction is never grouped —
 * `0.12345678` is a rate's scale, not a quantity, and splitting it into threes
 * reads as a phone number.
 *
 * **The group separator is fixed and the decimal mark is not.** §4.1 settles
 * the separator at U+00A0 for every language, on the grounds that a space group
 * is unambiguous in both conventions this product meets. That argument leaves
 * the mark open, and once the groups are spaces `12 480,20` and `12 480.20` are
 * each unambiguous — so the mark follows the reader's language. It is a
 * parameter rather than a lookup because `core` has no locale and must not
 * acquire one: it ships to a phone, a server and a test, and the caller is the
 * only one of the three that knows who is reading. `ui/i18n/locales` holds the
 * mapping.
 */
export const forDisplay = (v: Money, decimals: number, mark: "." | "," = "."): string => {
  const fixed = dec(v).toFixed(decimals);
  const [whole = "", fraction] = fixed.split(".");
  const negative = whole.startsWith("-");
  const digits = negative ? whole.slice(1) : whole;
  const grouped = digits.replace(/\B(?=(\d{3})+(?!\d))/g, GROUP);
  return `${negative ? "-" : ""}${grouped}${fraction === undefined ? "" : `${mark}${fraction}`}`;
};

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
declare const CURRENCY: unique symbol;

/**
 * An ISO 4217 code.
 *
 * Four columns hold one — `currency`, `to_currency`, `debt_currency`,
 * `settlement_currency` — and all four were `string`, which is also what
 * `payee`, `note` and `memo` are. A currency and a payee were interchangeable
 * on the same row.
 *
 * Not a union of known codes: `currencies` is a table a person adds rows to
 * (§7.6), so a closed union would be a second list to keep in step with the
 * database and would reject a currency the moment someone added one.
 */
export type CurrencyCode = string & { readonly [CURRENCY]: "CurrencyCode" };

/** Parse a currency code. Shape only — whether it *exists* is the table's answer. */
export function currencyCode(value: string): CurrencyCode {
  if (!/^[A-Z]{3}$/.test(value)) {
    throw new Error(`not an ISO 4217 code: ${JSON.stringify(value)} — expected three capitals`);
  }
  return value as CurrencyCode;
}

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

/**
 * §4 — the reverse of `toPivotByDivision`: `from_pivot(p, ccy, date) = p ×
 * rate(pivot, ccy, date)`. `rate` is `fx_rates`' own direction, units of
 * `ccy` per one pivot, so this multiplies rather than divides.
 */
export const fromPivot = (pivotAmount: Money, rate: UnitsPerPivot): Money =>
  toMoney(dec(pivotAmount).times(rate));

/**
 * §4 — display conversion: `convert(x, from, to) = from_pivot(to_pivot(x,
 * from), to)`. Both rates are `UnitsPerPivot` — `fx_rates`' own direction —
 * because this is the display path, not a transaction's stamped `fx_rate`
 * (§7.5's `PivotPerUnit`, which `margin` below uses instead).
 *
 * Full precision throughout; the caller rounds at the display boundary
 * (`round`), the same division of labour `toPivot` already keeps.
 */
export const convert = (amount: Money, rateFrom: UnitsPerPivot, rateTo: UnitsPerPivot): Money =>
  fromPivot(toPivotByDivision(amount, rateFrom), rateTo);

/**
 * §4a / §7.5 — the cost of a cross-currency transfer, as the reference rate
 * would have valued it against what actually arrived.
 *
 * `fxRate` and `toFxRate` are both `PivotPerUnit` — a transaction's own
 * stamped rates, never `fx_rates`' `UnitsPerPivot` (`convert`'s pair above).
 * §7.5: `to_fx_rate` is the **reference** rate for `to_currency`, in the same
 * pivot-per-unit direction as `fx_rate` — storing the *realized* rate there
 * instead would value both legs to the same pivot amount and make the
 * margin identically zero for every transfer ever recorded.
 *
 * `marginPct` is the plain ratio `margin_pivot ÷ amount_pivot` — §4a's
 * formula, not pre-multiplied by 100. A screen renders it as a percentage;
 * this returns the number the formula defines.
 *
 * **Never clamped.** A negative margin means the transfer beat the
 * reference rate, and §7.5 is explicit that it "must render as such rather
 * than being clamped" — so this returns whatever the arithmetic gives.
 */
export type MarginInput = {
  amountOriginal: Money;
  fxRate: PivotPerUnit;
  toAmount: Money;
  toFxRate: PivotPerUnit;
};

export type MarginResult = {
  marginPivot: Money;
  marginPct: Money;
  /** `to_amount ÷ amount_original` — derived here, never stored (§7.5). */
  realizedRate: Money;
};

export const margin = ({
  amountOriginal,
  fxRate,
  toAmount,
  toFxRate,
}: MarginInput): MarginResult => {
  const amountPivot = dec(amountOriginal).times(fxRate);
  const toAmountPivot = dec(toAmount).times(toFxRate);
  const marginPivot = amountPivot.minus(toAmountPivot);
  return {
    marginPivot: toMoney(marginPivot),
    marginPct: toMoney(marginPivot.dividedBy(amountPivot)),
    realizedRate: toMoney(dec(toAmount).dividedBy(amountOriginal)),
  };
};

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

/* ── The class-F folds — computations.md §2, §3, §7, §8 ──────────────────── */

/**
 * The rows a balance is folded over: both legs of a transfer reach the fold,
 * and the fold decides which leg belongs to which account. Named `LegRow`
 * rather than "transaction" because a transaction contributes to two
 * accounts with two different amounts (§7.2), and a type that carried only
 * `amountOriginal` could not express the destination.
 */
export type LegRow = {
  type: TxnType;
  accountId: string;
  toAccountId?: string | null;
  amountOriginal: Money;
  toAmount?: Money | null;
};

/**
 * §2 — `opening_balance + Σ signed(from) + Σ to_amount`, in the account's own
 * currency. **Never `SUM(amount_pivot)`**: that column exists only on the
 * source leg. Full precision throughout; the caller rounds at the boundary.
 *
 * This is the phone's copy of the SQL in `packages/db/src/figures/`, and
 * `differential.test.ts` is what keeps the two equal.
 */
export const accountBalance = (
  openingBalance: Money,
  accountId: string,
  rows: readonly LegRow[],
): Money => {
  let total = dec(openingBalance);
  for (const row of rows) {
    if (row.accountId === accountId) total = total.plus(dec(signed(row, "from")));
    if (row.toAccountId === accountId) total = total.plus(dec(signed(row, "to")));
  }
  return toMoney(total);
};

export type BalanceRow = { ownership: "own" | "shared"; balance: Money };

/**
 * §3 — `mine` over `ownership = 'own'`, `ours` over every account. Business
 * accounts are **in** `mine`: the scope partition (§6.7) is a transaction-level
 * filter and cannot partition a balance composed of rows on both sides of it.
 * Receivables are excluded by construction — they are not accounts.
 */
export const netWorth = (balances: readonly BalanceRow[]): { mine: Money; ours: Money } => {
  let mine = dec(0);
  let ours = dec(0);
  for (const { ownership, balance } of balances) {
    const b = dec(balance);
    ours = ours.plus(b);
    if (ownership === "own") mine = mine.plus(b);
  }
  return { mine: toMoney(mine), ours: toMoney(ours) };
};

export type DebtRow = {
  type: TxnType;
  amountOriginal: Money;
  toAmount?: Money | null;
  side: "from" | "to";
  /** `coalesce(debt_currency, currency)` (§7) — resolved by the caller, same as `side`. */
  currency: CurrencyCode;
};

export type CounterpartyBalanceRow = { currency: CurrencyCode; balance: Money };

/**
 * §7 — `balance(c, ccy) = Σ −signed(t, side)`, **one row per currency the
 * counterparty holds a balance in**. A debt in PLN and a debt in EUR are not
 * fungible: summing them into a single figure invents an exchange rate
 * nobody agreed to. `side` is the leg carrying the counterparty and
 * `currency` is `coalesce(debt_currency, currency)` — the caller resolves
 * both from `counterparty_id` against the row, the same way it already
 * resolves `side`; this fold only sums and groups. The negation is the whole
 * rule (§6.6).
 */
export const counterpartyBalance = (
  rows: readonly DebtRow[],
): readonly CounterpartyBalanceRow[] => {
  const byCurrency = new Map<CurrencyCode, Decimal>();
  for (const row of rows) {
    const prior = byCurrency.get(row.currency) ?? dec(0);
    byCurrency.set(row.currency, prior.plus(dec(debtDelta(row, row.side))));
  }
  return [...byCurrency.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([currency, total]) => ({ currency, balance: toMoney(total) }));
};

/** §8 — a clearing balance is an ordinary balance. Same function, named for the reader. */
export const clearingBalance = accountBalance;

/* ── §5 and §8's phone-side folds — C2, `computations.md` §0's R and F ───── */

/**
 * A closed-open date range, `[start, end)`. Half-open so a calendar month is
 * `{ start: "2026-08-01", end: "2026-09-01" }` — the caller reaches `end` with
 * `shiftMonth` alone and never has to know how many days August has.
 */
export type Period = { start: AccountingDate; end: AccountingDate };

const inPeriod = (date: AccountingDate, period: Period): boolean =>
  date >= period.start && date < period.end;

export type PeriodTransactionRow = {
  type: TxnType;
  date: AccountingDate;
  ownership: "own" | "shared";
  currency: CurrencyCode;
  decimals: number;
  amountOriginal: Money;
};

export type PeriodSpendRow = { currency: CurrencyCode; decimals: number; spend: Money; net: Money };

/**
 * §5's base figure — class **R** (`computations.md` §0): `spend` is the
 * stored, positive sum of expense amounts, `inflow` the same over income,
 * `net = inflow − spend`. Own accounts, dated within `period`. Business is
 * included — the scope partition (§6.7) is a filter of its own, not this
 * one's.
 *
 * **`spend` is a magnitude, never `signed()`'s negated delta.** §5 sums
 * `amount_pivot` — the stored amount converted, never negated — and §12
 * defines `spent` as exactly this figure, "capital included and broken out."
 * A screen wanting the outflow's sign renders it through `<Amount
 * kind="spend">`, which negates for display; the figure itself does not
 * carry a sign `net`'s subtraction already accounts for.
 *
 * **Grouped by currency, one row each — never summed across them.** §5 sums
 * `amount_pivot`, a converted figure; the phone has no pivot column and no
 * display currency to convert into (arc-phone excludes FX entirely, same as
 * `netWorth` above), so this sums `amountOriginal` instead, which is only
 * meaningful within one currency. Folding a PLN row and a USD row into one
 * total would be exactly the H21 mistake `netWorth` and `subtotalsOf`
 * (`create-phone-ledger.ts`) already refuse to make.
 *
 * **No shared-boundary netting.** `shared_net` (§5) needs `to_amount_pivot`,
 * a generated column that lives only in `packages/db`'s `transactions_valued`
 * view — arc-full, class **S**. The SQL `E9`'s differential test will check
 * this against is §5's `spend`/`inflow` restricted the same way: `type in
 * ('income', 'expense') and date >= period.start and date < period.end and
 * account.ownership = 'own'`, grouped by `currency`.
 */
export const periodSpend = (
  rows: readonly PeriodTransactionRow[],
  period: Period,
): readonly PeriodSpendRow[] => {
  const byCurrency = new Map<CurrencyCode, { decimals: number; spend: Decimal; inflow: Decimal }>();
  for (const row of rows) {
    if (row.ownership !== "own") continue;
    if (row.type !== "income" && row.type !== "expense") continue;
    if (!inPeriod(row.date, period)) continue;
    const bucket = byCurrency.get(row.currency) ?? {
      decimals: row.decimals,
      spend: dec(0),
      inflow: dec(0),
    };
    // Stored positive (§1) — the magnitude §12's `spent` names, not a signed delta.
    const amount = dec(row.amountOriginal);
    if (row.type === "expense") bucket.spend = bucket.spend.plus(amount);
    else bucket.inflow = bucket.inflow.plus(amount);
    byCurrency.set(row.currency, bucket);
  }
  return [...byCurrency.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([currency, { decimals, spend, inflow }]) => ({
      currency,
      decimals,
      spend: toMoney(spend),
      net: toMoney(inflow.minus(spend)),
    }));
};

export type ClearingAccountRow = {
  accountId: string;
  name: string;
  currency: CurrencyCode;
  decimals: number;
  balance: Money;
};

/**
 * §8 — every clearing account whose `clearingBalance` is non-zero. **A
 * filter, not a fold**: the caller has already folded each clearing
 * account's own rows into `balance` the way `readAccountsForNetWorth` does
 * for §3, so this only asks which of those balances are non-zero.
 *
 * **FIFO attribution — which transaction is the oldest unconsumed one — is
 * `fifoOldestOpen`'s job below, not this filter's.** It used to read "stays
 * server-only": that was true only because nothing on the phone folded the
 * account's own legs through FIFO yet. §0's class-**S** line is narrower —
 * "largest-remainder allocation must not be reimplemented" — and names the
 * *split*, never the *pointer* to the oldest row. The replica holds the
 * whole history the same way it does for §7's ageing (§0's own
 * reclassification note there), so `readUnsettledClearing` calls
 * `fifoOldestOpen` over each account's legs to fill in that pointer.
 */
export const unsettledClearing = (
  balances: readonly ClearingAccountRow[],
): readonly ClearingAccountRow[] => balances.filter((row) => !isZero(row.balance));

/* ── The FIFO fold — computations.md §7 ageing and §8 attribution, one algorithm ── */

export type FifoDelta<TId extends string> = { id: TId; date: AccountingDate; delta: Money };
export type FifoOldest<TId extends string> = { id: TId; date: AccountingDate };

/**
 * The oldest row still carrying a positive, unconsumed remainder — FIFO,
 * ordered `(date, id)`.
 *
 * **One algorithm, two readers.** §7's ageing needs "the oldest still-open
 * `debt` row for a company"; §8's `find_unsettled` needs "the oldest still-
 * unconsumed inflow to a clearing account" — the same shape, "the oldest row
 * a queue of later opposite-signed rows has not yet fully eaten," so this is
 * one function rather than two copies that could drift.
 *
 * **Which deltas *open* and which *consume* is decided once, by the sign of
 * the final balance** — never a running mid-stream sign, and never a type
 * check on the row. A delta sharing the final balance's sign opens (§8:
 * "inflows opened, outflows consume" reads as exactly this, when the final
 * balance is the ordinary positive-unallocated case); a delta of the
 * opposite sign draws down the oldest open row first, then the next.
 *
 * Returns `null` when the balance is zero — nothing is unconsumed because
 * nothing is owed. Otherwise the returned row's remainder is strictly
 * positive: a row exactly exhausted by consumption is never "still open."
 */
export function fifoOldestOpen<TId extends string>(
  deltas: readonly FifoDelta<TId>[],
): FifoOldest<TId> | null {
  const total = deltas.reduce((acc, row) => acc.plus(dec(row.delta)), dec(0));
  if (total.isZero()) return null;
  const finalSign = total.isPositive() ? 1 : -1;

  const sorted = [...deltas].sort((a, b) => {
    if (a.date !== b.date) return a.date < b.date ? -1 : 1;
    if (a.id === b.id) return 0;
    return a.id < b.id ? -1 : 1;
  });

  const open: { id: TId; date: AccountingDate; remaining: Decimal }[] = [];
  for (const row of sorted) {
    const amount = dec(row.delta);
    if (amount.isZero()) continue;
    const sign = amount.isPositive() ? 1 : -1;
    if (sign === finalSign) {
      open.push({ id: row.id, date: row.date, remaining: amount.abs() });
      continue;
    }
    let toConsume = amount.abs();
    // `.gt(0)`, never `.isPositive()`: decimal.js's zero carries a stored
    // sign (`new Decimal(0).isPositive()` is `true`), so a subtraction that
    // lands on exact zero never trips the loop's exit condition — it keeps
    // "consuming" a zero remainder against the next open row forever. Found
    // by running the exact case below (lend 200, lend 300, a repay of 200
    // that exactly exhausts the first): the process pegged a core at 100%
    // CPU and never returned.
    while (toConsume.gt(0) && open.length > 0) {
      // biome-ignore lint/style/noNonNullAssertion: guarded by `open.length > 0` above.
      const oldest = open[0]!;
      if (oldest.remaining.lte(toConsume)) {
        toConsume = toConsume.minus(oldest.remaining);
        open.shift();
      } else {
        oldest.remaining = oldest.remaining.minus(toConsume);
        toConsume = dec(0);
      }
    }
  }

  const oldest = open[0];
  return oldest ? { id: oldest.id, date: oldest.date } : null;
}

/**
 * §7's ageing buckets. `days` is `ageInDays`'s output — this only buckets.
 * The label rule ("*old*, never *overdue*") belongs to the screen, not here:
 * without a `payment_terms_days` field this function has no way to know a
 * debt is late, only how long it has stood open.
 */
export type AgeBucket = "0-30" | "31-60" | "61-90" | "90+";

export const ageBucket = (days: number): AgeBucket => {
  if (days <= 30) return "0-30";
  if (days <= 60) return "31-60";
  if (days <= 90) return "61-90";
  return "90+";
};

/**
 * §7's ageing figure: whole days from the oldest still-open `debt` row to
 * `today`. Bare-string day arithmetic through `date.ts`'s `daysBetween` —
 * never a `Date` diff in this module.
 */
export const ageInDays = (oldestDate: AccountingDate, today: AccountingDate): number =>
  daysBetween(oldestDate, today);

/**
 * S12's two direction totals — *they owe you*, *you owe* — per currency,
 * **never summed across people**: a receivable from one counterparty and a
 * payable to another do not net against each other just because they share
 * a currency, so this sums the *positive* balances into `theyOwe` and the
 * *magnitude* of the negative ones into `youOwe`, both non-negative.
 *
 * Takes the same `CounterpartyBalanceRow[]` shape `counterpartyBalance`
 * above produces — one row per counterparty per currency — so the caller
 * folds every counterparty's balances into one list and hands it here
 * directly.
 */
export type DirectionTotalRow = { currency: CurrencyCode; theyOwe: Money; youOwe: Money };

export const directionTotals = (
  rows: readonly CounterpartyBalanceRow[],
): readonly DirectionTotalRow[] => {
  const byCurrency = new Map<CurrencyCode, { theyOwe: Decimal; youOwe: Decimal }>();
  for (const { currency, balance } of rows) {
    const bucket = byCurrency.get(currency) ?? { theyOwe: dec(0), youOwe: dec(0) };
    const b = dec(balance);
    if (b.isPositive()) bucket.theyOwe = bucket.theyOwe.plus(b);
    else if (b.isNegative()) bucket.youOwe = bucket.youOwe.plus(b.abs());
    byCurrency.set(currency, bucket);
  }
  return [...byCurrency.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([currency, { theyOwe, youOwe }]) => ({
      currency,
      theyOwe: toMoney(theyOwe),
      youOwe: toMoney(youOwe),
    }));
};

/**
 * §8's largest-remainder allocation, as a pure function — J08's group-bill
 * split. **Never `total × (1/n)`**: that leaves dust in the same direction
 * every time (three ways on 185,00 never sums back to 185,00), and the
 * clearing invariant (§6.4: "a clearing account should trend to zero") would
 * never clear again.
 *
 * Floor each share at the currency's scale, then hand out the remainder one
 * minor unit at a time, by descending fractional part, ties by ascending
 * index. **Total-preserving by construction** — `sum(shares) === total`,
 * always, because every minor unit floored away is handed to exactly one
 * share before this returns.
 */
export const allocateLargestRemainder = (
  total: Money,
  weights: readonly number[],
  decimals: number,
): readonly Money[] => {
  if (weights.length === 0) return [];
  const weightSum = weights.reduce((sum, w) => sum + w, 0);
  if (!(weightSum > 0)) {
    throw new Error("allocateLargestRemainder: weights must sum to a positive number");
  }

  const scale = new Decimal(10).pow(decimals);
  const totalUnits = dec(total).times(scale);
  const exactUnits = weights.map((w) => totalUnits.times(w).dividedBy(weightSum));
  const floorUnits = exactUnits.map((s) => s.toDecimalPlaces(0, Decimal.ROUND_DOWN));
  const remainders = exactUnits.map((s, i) => s.minus(floorUnits[i] as Decimal));

  const distributed = floorUnits.reduce((acc, f) => acc.plus(f), dec(0));
  // Whole minor units left to hand out. `total` is presumed to already sit at
  // the currency's own scale (`decimals`) — the realistic input, and the one
  // every worked example in §8 and J08 §5 uses — which makes this an exact
  // non-negative integer; `ROUND_HALF_UP` only guards the last place against
  // representation noise, never invents units.
  let leftover = totalUnits.minus(distributed).toDecimalPlaces(0, Decimal.ROUND_HALF_UP).toNumber();

  const order = weights
    .map((_, index) => index)
    .sort((a, b) => {
      // biome-ignore lint/style/noNonNullAssertion: `order`'s indices are exactly `remainders`'s.
      const byRemainder = remainders[b]!.cmp(remainders[a]!);
      return byRemainder !== 0 ? byRemainder : a - b;
    });

  const units = [...floorUnits];
  for (let k = 0; k < order.length && leftover > 0; k += 1) {
    // biome-ignore lint/style/noNonNullAssertion: `order` is a permutation of `units`'s own indices.
    const index = order[k]!;
    // biome-ignore lint/style/noNonNullAssertion: same permutation guarantee as above.
    units[index] = units[index]!.plus(1);
    leftover -= 1;
  }

  return units.map((u) => toMoney(u.dividedBy(scale)));
};

export { Decimal };
