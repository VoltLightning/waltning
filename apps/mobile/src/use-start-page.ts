import type { PagerPageKey } from "@waltning/client/ledger/pager-date";
import {
  showStartPage,
  startPage,
  subscribeStartPage,
} from "@waltning/client/ledger/tab-back/start-page-store";
import { router } from "expo-router";
import { useSyncExternalStore } from "react";

/**
 * The page Start is drawing right now, as its pager publishes it — not the
 * route, which trails a swipe by `URL_LAG_MS` (`use-pager-route.ts`).
 */
export function useStartPage(): PagerPageKey {
  return useSyncExternalStore(subscribeStartPage, startPage, startPage);
}

/**
 * Start's overview page — through the pager, so a write it has pending cannot
 * land afterwards and put the old page back; the route is the fallback when no
 * pager is mounted.
 */
export function showStartOverview(): void {
  if (!showStartPage("summary")) router.setParams({ view: "summary" });
}
