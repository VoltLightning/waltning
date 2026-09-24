/**
 * `useHoldings` — `holdings()` over the phone ledger, at today's rates.
 *
 * The rate read is the register's own (`accounts-screen.tsx`'s
 * `conversionOf`): the replica's rate for today, carried forward or set by
 * hand, quoted per pivot and turned round to reach the pivot from the
 * account's currency. `null` where the replica holds none, and then the
 * account is left out and counted as left out, never valued at a guess.
 *
 * `revision` is in the dependencies for the reason `useCounterpartyHistory`
 * gives: `readRate` is a live read, so a rate set elsewhere must re-run this
 * even though nothing else this hook is handed has changed.
 */

import type { AccountingDate } from "@waltning/core/date";
import * as money from "@waltning/core/money";
import { useMemo } from "react";
import { type Holdings, type HoldingsAccount, holdings } from "./holdings.ts";

/**
 * The one ledger read this needs, stated by shape rather than imported: the
 * phone ledger satisfies it, and `accounts/` names no other module.
 */
export type HoldingsRates = {
  readRate: (pair: {
    base: money.CurrencyCode;
    quote: money.CurrencyCode;
    date: AccountingDate;
  }) => { rate: money.UnitsPerPivot } | null;
};

export type HoldingsCurrencyInfo = { code: money.CurrencyCode; decimals: number; isPivot: boolean };

export function useHoldings(
  ledger: HoldingsRates,
  accounts: readonly HoldingsAccount[],
  currencies: readonly HoldingsCurrencyInfo[],
  today: AccountingDate,
  revision: number,
): Holdings | null {
  const pivot = currencies.find((currency) => currency.isPivot);
  // biome-ignore lint/correctness/useExhaustiveDependencies: `revision` invalidates the live rate reads by identity, not by being read.
  return useMemo(() => {
    if (pivot === undefined) return null;
    return holdings(accounts, { currency: pivot.code, decimals: pivot.decimals }, (currency) => {
      const held = ledger.readRate({ base: pivot.code, quote: currency, date: today });
      return held === null ? null : money.reciprocal(held.rate);
    });
  }, [ledger, accounts, pivot, today, revision]);
}
