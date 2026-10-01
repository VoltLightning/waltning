/**
 * The basis every figure on a screen is stated in: §7.0's display currency,
 * with the pivot as the answer whenever the display currency cannot be
 * stated honestly (not held, or no rate for it today).
 *
 * `null` before the ledger knows its pivot — the same bootstrap window
 * `useHoldings` answers `null` for.
 */

import type { AccountingDate } from "@waltning/core/date";
import type * as money from "@waltning/core/money";
import { useMemo } from "react";
import {
  createDisplayBasis,
  type DisplayBasis,
  type DisplayBasisCurrency,
} from "../display-basis/display-basis.ts";
import {
  type DisplayCurrencyController,
  useDisplayCurrency,
} from "../display-currency/display-currency.ts";

export type DisplayBasisRates = {
  readRate: (pair: {
    base: money.CurrencyCode;
    quote: money.CurrencyCode;
    date: AccountingDate;
  }) => { rate: money.UnitsPerPivot; asOf: AccountingDate } | null;
};

export type DisplayBasisCurrencyInfo = DisplayBasisCurrency & { isPivot: boolean };

export function useDisplayBasis(
  ledger: DisplayBasisRates,
  currencies: readonly DisplayBasisCurrencyInfo[],
  displayCurrency: DisplayCurrencyController,
  today: AccountingDate,
  revision: number,
): DisplayBasis | null {
  const wanted = useDisplayCurrency(displayCurrency).currency;
  const pivot = currencies.find((currency) => currency.isPivot);
  const held = currencies.find((currency) => currency.code === wanted);
  // biome-ignore lint/correctness/useExhaustiveDependencies: `revision` invalidates the live rate reads by identity, not by being read.
  return useMemo(() => {
    if (pivot === undefined) return null;
    const readRate = (quote: money.CurrencyCode, date: AccountingDate) =>
      ledger.readRate({ base: pivot.code, quote, date });
    const usable =
      held !== undefined && (held.code === pivot.code || readRate(held.code, today) !== null);
    const display = usable ? held : pivot;
    return createDisplayBasis({
      pivot,
      display,
      readRate,
      today,
    });
  }, [ledger, pivot, held, today, revision]);
}
