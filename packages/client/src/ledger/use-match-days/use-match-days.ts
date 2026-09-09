/**
 * `useMatchDays` — §7's match counts for a period, or nothing when the screen
 * is not searching.
 *
 * **Rows, not a grid**, for `useDayFlows`' own reason: a read hook that knew
 * what a calendar looked like could not be used by anything that is not one.
 * `transactions/match-counts` does the folding and `module-boundaries` keeps
 * the two apart.
 *
 * **`null` means no search, and it costs nothing.** A query of `null` skips the
 * read entirely rather than asking the ledger to match the empty string against
 * every row in the period — which is what an empty needle does, and it matches
 * all of them.
 */

import type { AccountingDate } from "@waltning/core/date";
import type * as money from "@waltning/core/money";
import { useMemo } from "react";
import type {
  PhoneLedgerController,
  PhoneLedgerSnapshot,
} from "../create-phone-ledger/create-phone-ledger.ts";

export type MatchDay = { date: AccountingDate; count: number };

const NONE: readonly MatchDay[] = [];

export function useMatchDays(
  ledger: PhoneLedgerController,
  period: money.Period,
  query: string | null,
  revision: PhoneLedgerSnapshot,
): readonly MatchDay[] {
  return useMemo(() => {
    void revision;
    if (query === null) return NONE;
    return ledger.readMatchDays(period, query);
  }, [ledger, period, query, revision]);
}
