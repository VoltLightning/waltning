/**
 * `useCategoryReferenceCounts` — S19's merge preview counts, memoised (M2).
 *
 * `CategoriesScreen` used to call `ledger.readCategoryReferenceCounts`
 * straight in its own render body — not behind a hook, so it ran on *every*
 * render the screen made while the merge sheet was open, including every
 * keystroke in the search field above it, each one three unindexed table
 * scans (`transactions`, `transaction_lines`, `recurring_transactions`) that
 * the write it previews cannot have changed.
 *
 * **Its own file, its own hook** (`CLAUDE.md`: "every hook has its own file;
 * none live in route files") — `use-counterparty-history.ts` beside this
 * file is the same fix for the same reason, one screen over.
 */

import { useMemo } from "react";
import type { PhoneCategoryReferenceCounts, PhoneLedgerController } from "./create-phone-ledger.ts";

const EMPTY: PhoneCategoryReferenceCounts = { transactions: 0, lines: 0, rules: 0 };

/**
 * Memoised on `[ledger, categoryId, revision]` — `revision` is
 * `PhoneLedgerSnapshot`'s own counter, bumped by every `refresh()`, so this
 * recomputes exactly when a write could have changed the answer, and never
 * merely because the screen re-rendered for an unrelated reason (a search
 * keystroke, a toggled section).
 */
export function useCategoryReferenceCounts(
  ledger: PhoneLedgerController,
  categoryId: string | undefined,
  revision: number,
): PhoneCategoryReferenceCounts {
  // `revision` is not read in the body — it is the invalidation signal
  // itself, the one dependency this hook exists to add (the same pattern
  // `useCounterpartyHistory`'s own `revision` and `useTimer`'s `resetKey`
  // use). Removing it would delete the "a write changes the answer"
  // behaviour this hook implements.
  // biome-ignore lint/correctness/useExhaustiveDependencies: revision invalidates this memo by identity, not by being read.
  return useMemo(() => {
    if (categoryId === undefined) return EMPTY;
    return ledger.readCategoryReferenceCounts(categoryId);
  }, [ledger, categoryId, revision]);
}
