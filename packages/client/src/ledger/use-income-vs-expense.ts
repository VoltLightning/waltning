/**
 * `useIncomeVsExpense` — §12's line chart, memoised (`DESK4`).
 *
 * See `use-spend-by-category.ts`'s own doc for why this lives in `ledger/`
 * rather than a `dashboard/` module.
 */

import { useMemo } from "react";
import type {
  PhoneIncomeExpenseBucket,
  PhoneIncomeExpenseRow,
  PhoneLedgerController,
} from "./create-phone-ledger.ts";

/**
 * Memoised on `[ledger, buckets, revision]` — the same reasoning
 * `useSpendByCategory` gives. `buckets` is screen state (the chosen
 * granularity and range), never computed here.
 */
export function useIncomeVsExpense(
  ledger: PhoneLedgerController,
  buckets: readonly PhoneIncomeExpenseBucket[],
  revision: number,
): readonly PhoneIncomeExpenseRow[] {
  // biome-ignore lint/correctness/useExhaustiveDependencies: revision invalidates this memo by identity, not by being read.
  return useMemo(() => ledger.readIncomeVsExpense(buckets), [ledger, buckets, revision]);
}
