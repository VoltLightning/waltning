/**
 * `useSpendByCategory` — §6's donut, memoised (`DESK4`).
 *
 * **Lives in `ledger/`, not a `dashboard/` module** — the same call
 * `use-counterparty-history.ts` makes and documents: this reads straight
 * through `PhoneLedgerController.readSpendByCategory`, and
 * `tests/module-boundaries.test.ts` refuses a domain-to-domain relative
 * import inside `packages/client/src` (`architecture/11`: compose at the
 * screen). `use-income-vs-expense.ts` and `use-dashboard-layout.ts` beside
 * this file are the same shape, for `S01`'s other two new reads.
 *
 * **Its own file, its own hook** (`CLAUDE.md`: "every hook has its own file;
 * none live in route files") — a hook written inline in a route closes over
 * whatever the route captured rather than taking its dependencies as
 * parameters, and is invisible to the test runner.
 */

import type * as money from "@waltning/core/money";
import { useMemo } from "react";
import type { PhoneLedgerController, PhoneSpendByCategory } from "./create-phone-ledger.ts";

/**
 * Memoised on `[ledger, period, scope, revision]` — `revision` is
 * `PhoneLedgerSnapshot`'s own counter, bumped by every `refresh()`, so this
 * recomputes exactly when a write could have changed the answer, and never
 * merely because the screen re-rendered for an unrelated reason.
 */
export function useSpendByCategory(
  ledger: PhoneLedgerController,
  period: money.Period,
  scope: money.LedgerScope,
  revision: number,
): readonly PhoneSpendByCategory[] {
  // `revision` is not read in the body — it is the invalidation signal
  // itself, the same pattern `useCounterpartyHistory`'s own `revision` uses.
  // biome-ignore lint/correctness/useExhaustiveDependencies: revision invalidates this memo by identity, not by being read.
  return useMemo(
    () => ledger.readSpendByCategory(period, scope),
    [ledger, period, scope, revision],
  );
}
