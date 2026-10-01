/**
 * `useIncomeVsExpense` — §12's line chart, memoised (`DESK4`).
 *
 * See `use-spend-by-category.ts`'s own doc for why this lives in `ledger/`
 * rather than a `dashboard/` module.
 */

import type { LedgerScope, SpendByCategoryOptions } from "@waltning/core/money";
import { useMemo } from "react";
import type {
  PhoneIncomeExpenseBucket,
  PhoneIncomeExpenseRow,
  PhoneLedgerController,
} from "../create-phone-ledger/create-phone-ledger.ts";

/**
 * Memoised on `[ledger, buckets, scope, revision]` — the same reasoning
 * `useSpendByCategory` gives. `buckets` is screen state (the chosen
 * granularity and range), never computed here.
 */
export function useIncomeVsExpense(
  ledger: PhoneLedgerController,
  buckets: readonly PhoneIncomeExpenseBucket[],
  scope: LedgerScope,
  revision: number,
  /** §7.0 — re-express each row in the display currency, at its own date's rate. */
  rebase?: SpendByCategoryOptions["rebase"],
): readonly PhoneIncomeExpenseRow[] {
  // biome-ignore lint/correctness/useExhaustiveDependencies: revision invalidates this memo by identity, not by being read.
  return useMemo(
    () =>
      rebase === undefined
        ? ledger.readIncomeVsExpense(buckets, scope)
        : ledger.readIncomeVsExpense(buckets, scope, { rebase }),
    [ledger, buckets, scope, revision, rebase],
  );
}
