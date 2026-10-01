/**
 * What every figure on a screen is stated in — §7.0's display currency — and
 * the one place a pivot-valued figure becomes one.
 *
 * The ledger stores and folds money against the pivot (every row carries its
 * own rate to it), so the folds and the figures they produce are pivot-valued.
 * **Re-expressing them is a multiplication by the display currency's rate on
 * each row's own date** (`computations.md` §4: *each row at the rate for its
 * own date, then the results sum* — never one rate looked up now). A day's
 * figure is a sum of rows that share a date, so scaling the day's pivot figure
 * by that date's rate is exactly the sum of the scaled rows.
 *
 * - `identity` — the display currency is the pivot, so nothing converts and
 *   every method returns what it was given.
 * - a row already in the display currency is its own figure, never a round
 *   trip through the pivot (a pegged pair would otherwise drift a cent).
 * - a date with no rate for the display currency falls on the nearest one the
 *   basis was given (`fallbackPerPivot`, today's) and says so (`estimated`);
 *   with no rate at all the basis is the pivot's, not a guess.
 *
 * Pure: the rate source is a parameter, memoised by date.
 */

import type { AccountingDate } from "@waltning/core/date";
import * as money from "@waltning/core/money";

export type DisplayBasisCurrency = { code: money.CurrencyCode; decimals: number };

export type DisplayBasisInput = {
  pivot: DisplayBasisCurrency;
  /** The currency figures are stated in. Equal to `pivot` converts nothing. */
  display: DisplayBasisCurrency;
  /** Units of `quote` per one pivot on a date, or `null` when it has none. */
  readRate: (
    quote: money.CurrencyCode,
    date: AccountingDate,
  ) => { rate: money.UnitsPerPivot; asOf: AccountingDate } | null;
  /** Today's — what a date with no rate of its own is stated at, flagged estimated. */
  today: AccountingDate;
};

/** A ledger row's two legs, as the day-total fold reads them. */
export type RebasableRow = {
  date: AccountingDate;
  currency: money.CurrencyCode;
  fxRate: money.PivotPerUnit;
  fxRateEstimated: boolean;
  toCurrency: money.CurrencyCode | null;
  toFxRate: money.PivotPerUnit | null;
};

export type DisplayBasis = {
  /** The currency every figure is stated in. */
  currency: money.CurrencyCode;
  decimals: number;
  /** `true` when the display currency is the pivot, so nothing is converted. */
  identity: boolean;
  /** A pivot-valued amount, on a date, in the display currency. */
  fromPivotAt: (amount: money.Money, date: AccountingDate) => money.Money;
  /** Whether a date is stated at a rate that is not its own — `fromPivotAt`'s answer is then an estimate (`≈`). */
  estimatedAt: (date: AccountingDate) => boolean;
  /** `spendByCategory`'s `rebase` option — `undefined` when nothing converts. */
  spendRebase: money.SpendByCategoryOptions["rebase"];
  /**
   * Units of `quote` per one display unit, on a date — what a balance in
   * `quote` is converted by, as `readRate` is to the pivot. `null` when either
   * leg has no rate.
   */
  unitsPerDisplay: (quote: money.CurrencyCode, date: AccountingDate) => money.UnitsPerPivot | null;
  /**
   * `unitsPerDisplay` with the date it actually rests on — the older of the two
   * legs' (`asOf`), which is what a carried rate must say. The shape
   * `makeRateOf` and `resolveCounterpartyFigures` read.
   */
  readFromDisplay: (
    quote: money.CurrencyCode,
    date: AccountingDate,
  ) => { rate: money.UnitsPerPivot; asOf: AccountingDate } | null;
  /** Rows whose `fxRate`/`toFxRate` now take an amount straight to the display currency. */
  rebaseRows: <Row extends RebasableRow>(rows: readonly Row[]) => readonly Row[];
  /**
   * `spendByCategory` rows read with `spendRebase`, stated in the display
   * currency: each bucket's `amountPivot` becomes its amount, buckets of one
   * category merge, and a bucket that could not be converted stays in its own
   * currency. Without a rebase (the identity) the rows are returned as read.
   */
  restateSpend: (rows: readonly money.SpendByCategoryRow[]) => readonly money.SpendByCategoryRow[];
  /** Day flows whose pivot figures are in the display currency. */
  rebaseFlows: (flows: readonly money.DayFlowRow[]) => readonly money.DayFlowRow[];
};

export function createDisplayBasis(input: DisplayBasisInput): DisplayBasis {
  const { pivot, display, readRate, today } = input;
  const identity = display.code === pivot.code;

  const cache = new Map<string, { rate: money.UnitsPerPivot; asOf: AccountingDate } | null>();
  /** Units of `quote` per pivot, with its date — the pivot itself is `1`, whatever the table says. */
  const legOf = (quote: money.CurrencyCode, date: AccountingDate) => {
    if (quote === pivot.code) return { rate: money.unitsPerPivot("1"), asOf: date };
    const key = `${quote}@${date}`;
    if (cache.has(key)) return cache.get(key) ?? null;
    const found = readRate(quote, date);
    cache.set(key, found);
    return found;
  };
  const perPivotOf = (quote: money.CurrencyCode, date: AccountingDate) =>
    legOf(quote, date)?.rate ?? null;
  const perPivotAt = (date: AccountingDate): money.UnitsPerPivot | null =>
    perPivotOf(display.code, date);
  /** The date's rate, or today's when the date has none (and `estimated` says so). */
  const resolve = (
    date: AccountingDate,
  ): { perPivot: money.UnitsPerPivot; estimated: boolean } | null => {
    const own = perPivotAt(date);
    if (own !== null) return { perPivot: own, estimated: false };
    const fallback = perPivotAt(today);
    return fallback === null ? null : { perPivot: fallback, estimated: true };
  };

  const fromPivotAt = (amount: money.Money, date: AccountingDate): money.Money => {
    if (identity) return amount;
    const rate = resolve(date);
    return rate === null ? amount : money.fromPivot(amount, rate.perPivot);
  };

  /** A leg's rate into the display currency: its own rate carried through the pivot. */
  const legRate = (
    currency: money.CurrencyCode | null,
    rate: money.PivotPerUnit | null,
    date: AccountingDate,
  ): { rate: money.PivotPerUnit | null; estimated: boolean } => {
    if (identity) return { rate, estimated: false };
    if (currency === display.code) return { rate: money.pivotPerUnit("1"), estimated: false };
    if (rate === null) return { rate: null, estimated: false };
    const resolved = resolve(date);
    if (resolved === null) return { rate, estimated: false };
    return {
      rate: money.pivotPerUnit(money.dec(rate).times(resolved.perPivot)),
      estimated: resolved.estimated,
    };
  };

  return {
    currency: display.code,
    decimals: display.decimals,
    identity,
    fromPivotAt,
    estimatedAt: (date) => !identity && (resolve(date)?.estimated ?? false),
    spendRebase: identity
      ? undefined
      : {
          currency: display.code,
          decimals: display.decimals,
          perPivot: (date) => {
            const found = resolve(date);
            return found === null ? null : { rate: found.perPivot, estimated: found.estimated };
          },
        },
    readFromDisplay: (quote, date) => {
      const quoted = legOf(quote, date);
      const shown = legOf(display.code, date);
      if (quoted === null || shown === null) return null;
      return {
        rate: money.unitsPerPivot(money.dec(quoted.rate).dividedBy(shown.rate)),
        asOf: quoted.asOf < shown.asOf ? quoted.asOf : shown.asOf,
      };
    },
    unitsPerDisplay: (quote, date) => {
      const quoted = perPivotOf(quote, date);
      const shown = perPivotAt(date);
      if (quoted === null || shown === null) return null;
      return money.unitsPerPivot(money.dec(quoted).dividedBy(shown));
    },
    rebaseRows: (rows) => {
      if (identity) return rows;
      return rows.map((row) => {
        const from = legRate(row.currency, row.fxRate, row.date);
        const to = legRate(row.toCurrency, row.toFxRate, row.date);
        return {
          ...row,
          fxRate: from.rate ?? row.fxRate,
          toFxRate: to.rate,
          fxRateEstimated: row.fxRateEstimated || from.estimated || to.estimated,
        };
      });
    },
    restateSpend: (rows) => {
      if (identity) return rows;
      const merged = new Map<string, money.SpendByCategoryRow>();
      for (const row of rows) {
        const stated =
          row.currency === display.code || row.amountPivot === null || row.amountPivot === undefined
            ? row
            : {
                ...row,
                currency: display.code,
                decimals: display.decimals,
                amount: row.amountPivot,
              };
        const key = `${stated.currency}::${stated.categoryId ?? ""}`;
        const held = merged.get(key);
        merged.set(
          key,
          held === undefined
            ? stated
            : {
                ...held,
                amount: money.add(held.amount, stated.amount),
                ...(held.estimated === true || stated.estimated === true
                  ? { estimated: true }
                  : {}),
              },
        );
      }
      return [...merged.values()];
    },
    rebaseFlows: (flows) => {
      if (identity) return flows;
      return flows.map((flow) => {
        const own = flow.currency === display.code;
        const hasPivot = flow.spendPivot !== null && flow.inflowPivot !== null;
        // The pivot figures when the bucket carries them; a bucket in the
        // pivot itself carries its own, which is the pivot's.
        const spendInPivot = hasPivot
          ? flow.spendPivot
          : flow.currency === pivot.code
            ? flow.spend
            : null;
        const inflowInPivot = hasPivot
          ? flow.inflowPivot
          : flow.currency === pivot.code
            ? flow.inflow
            : null;
        const spend = own
          ? flow.spend
          : spendInPivot === null
            ? null
            : fromPivotAt(spendInPivot, flow.date);
        const inflow = own
          ? flow.inflow
          : inflowInPivot === null
            ? null
            : fromPivotAt(inflowInPivot, flow.date);
        // A day stated at today's rate is an estimate, unless it needed no rate
        // at all (a day already in the display currency).
        const estimated =
          !own && (spend !== null || inflow !== null) && (resolve(flow.date)?.estimated ?? false);
        return {
          ...flow,
          spendPivot: spend,
          inflowPivot: inflow,
          ...(estimated ? { estimated } : {}),
        };
      });
    },
  };
}
