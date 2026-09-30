import { isPagerPageKey, type PagerPageKey } from "@waltning/client/ledger/pager-date";
import { router, useGlobalSearchParams } from "expo-router";

/**
 * The page Start is showing, read from the route the pager keeps it in
 * (`use-pager-route.ts`). An absent or unknown view is the overview, the same
 * rule `parsePagerState` applies.
 */
export function useStartPage(): PagerPageKey {
  const { view } = useGlobalSearchParams<{ view?: string }>();
  return view !== undefined && isPagerPageKey(view) ? view : "summary";
}

/** Start's overview page — a parameter of the screen, not a new entry. */
export function showStartOverview(): void {
  router.setParams({ view: "summary" });
}
