/**
 * `useDashboardLayout` — `get_active_layout`, memoised (`DESK4`).
 *
 * See `use-spend-by-category.ts`'s own doc for why this lives in `ledger/`
 * rather than a `dashboard/` module. Read but not rearranged this arc — S24
 * writes a layout; this only ever reads the active one.
 */

import { useMemo } from "react";
import type { PhoneDashboardLayout, PhoneLedgerController } from "./create-phone-ledger.ts";

/**
 * Memoised on `[ledger, revision]` — the same reasoning `useSpendByCategory`
 * gives. `null` only on an empty, never-migrated database — `DESK4`'s
 * migration seeds one on every install, so `S01` only sees it while a
 * database predates that step.
 */
export function useDashboardLayout(
  ledger: PhoneLedgerController,
  revision: number,
): PhoneDashboardLayout | null {
  // biome-ignore lint/correctness/useExhaustiveDependencies: revision invalidates this memo by identity, not by being read.
  return useMemo(() => ledger.readActiveDashboardLayout(), [ledger, revision]);
}
