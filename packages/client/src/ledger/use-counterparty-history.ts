/**
 * `useCounterpartyHistory` — S13's two history reads, memoised (M2).
 *
 * `CounterpartyDetail` used to call `ledger.searchTransactions` twice
 * directly in its own render body (once for the `debt`-only default, once
 * for "every row") — not behind a hook, so both ran on *every* render,
 * including every keypad digit typed into the settle sheet (a keystroke sets
 * local component state, which re-renders the whole screen). Neither read
 * depends on that state; only a write to the ledger can change what they
 * answer.
 *
 * **Its own file, its own hook** (`CLAUDE.md`: "every hook has its own file;
 * none live in route files") — a hook written inline in a route closes over
 * whatever the route captured rather than taking its dependencies as
 * parameters, and is invisible to the test runner.
 *
 * **Lives in `ledger/`, not `counterparties/`** — this reads straight through
 * `PhoneLedgerController.searchTransactions`, and `tests/module-boundaries.test.ts`
 * refuses a domain-to-domain import inside `packages/client/src`
 * (`architecture/11`: compose at the screen). `use-transaction-search.ts`
 * beside this file is the same read, memoised the same way, for S10 instead
 * of S13.
 */

import { useMemo } from "react";
import type { PhoneLedgerController, PhoneSearchPage } from "./create-phone-ledger.ts";

const EMPTY_PAGE: PhoneSearchPage = {
  rows: [],
  nextCursor: undefined,
  total: { count: 0, currencies: [] },
};

export type CounterpartyHistory = {
  /** S13 §3's default — `debt` role only. */
  debtHistory: PhoneSearchPage;
  /** Every role, read once "· N other rows" is opened. */
  everyHistory: PhoneSearchPage;
};

/**
 * Memoised on `[ledger, counterpartyId, revision]` — `revision` is
 * `PhoneLedgerSnapshot`'s own counter (H1), bumped by every `refresh()`, so
 * this recomputes exactly when a write could have changed the answer, and
 * never merely because the screen re-rendered for an unrelated reason (a
 * keypad digit, a toggled section).
 */
export function useCounterpartyHistory(
  ledger: PhoneLedgerController,
  counterpartyId: string | undefined,
  revision: number,
): CounterpartyHistory {
  // `revision` is not read in the body — it is the invalidation signal
  // itself, the one dependency this hook exists to add (the same pattern
  // `useTimer`'s own `resetKey` uses). Removing it would delete the "a write
  // changes the answer" behaviour this hook implements.
  // biome-ignore lint/correctness/useExhaustiveDependencies: revision invalidates this memo by identity, not by being read.
  return useMemo(() => {
    if (counterpartyId === undefined) return { debtHistory: EMPTY_PAGE, everyHistory: EMPTY_PAGE };
    return {
      debtHistory: ledger.searchTransactions({ counterpartyId, counterpartyRole: "debt" }),
      everyHistory: ledger.searchTransactions({ counterpartyId }),
    };
  }, [ledger, counterpartyId, revision]);
}
