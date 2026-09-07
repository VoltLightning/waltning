/**
 * `useDebouncedValue` — a value that lags the one handed in until it has
 * stopped changing for `delayMs`.
 *
 * **Foundation, not a domain.** It sits beside `use-query.ts` for the same
 * reason that file does: neither knows what it is reading, both are about
 * *when* a read happens. A debounce filed under `ledger/` would be a claim
 * that "wait until the typing stops" is a fact about a ledger.
 *
 * **Why S10 needs it** (M4, round 2): `useTransactionSearch` re-runs on the
 * filter's serialised shape, the desk branch drains *every* page of the
 * filtered period, and a `text` filter is the one dimension SQLite cannot
 * decide — `search-transactions.ts` reads the whole structurally-matching
 * set into JS and folds every row. So typing `groceries` used to run nine
 * full-set folds, of which eight were of prefixes nobody asked to see. The
 * text input stays immediate (`filter.text` is what the field renders); only
 * the *query* waits.
 *
 * **The first value is not debounced.** A hook that returned `undefined`, or
 * the empty string, for the first 250 ms of every mount would make the first
 * paint of every screen a lie about what it is showing. The delay only ever
 * applies to a *change*.
 *
 * **The timer is cleared on unmount and on every change**, which is what
 * makes the last value win rather than the first: each new value cancels the
 * pending commit and starts its own.
 */

import { useEffect, useState } from "react";

/** S10's own text-filter delay. One number, one place — the screen and the tests read it here. */
export const TEXT_FILTER_DEBOUNCE_MS = 250;

export function useDebouncedValue<Value>(value: Value, delayMs: number): Value {
  const [settled, setSettled] = useState(value);

  // No guard against "the value is already settled": `setSettled` with an
  // equal value is a bail-out in React, not a render, and a guard reading
  // `settled` would have to be either a dependency (restarting the timer on
  // the debounce's own commit) or an exception to the rule that says so.
  useEffect(() => {
    const timer = setTimeout(() => setSettled(value), delayMs);
    return () => clearTimeout(timer);
  }, [value, delayMs]);

  return settled;
}
