/**
 * The page Start is showing, and the way to change it — published by the pager
 * (`use-pager-route.ts`) from the state it is actually drawing, which leads the
 * URL by `URL_LAG_MS`. Back and a re-tap decide from this, not from the route:
 * a swipe followed by back inside that lag would otherwise read the old page.
 */

import type { PagerPageKey } from "../use-pager-date/pager-date.ts";

type Shown = { page: PagerPageKey; show: ((page: PagerPageKey) => void) | null };

let shown: Shown = { page: "summary", show: null };
const listeners = new Set<() => void>();

function set(next: Shown): void {
  shown = next;
  for (const listener of listeners) listener();
}

export function publishStartPage(page: PagerPageKey, show: (page: PagerPageKey) => void): void {
  if (shown.page === page && shown.show === show) return;
  set({ page, show });
}

/** Start's pager is gone (the desk shows the dashboard instead). */
export function forgetStartPage(): void {
  set({ page: "summary", show: null });
}

export function startPage(): PagerPageKey {
  return shown.page;
}

/** Moves the pager; `false` when no pager is mounted to move. */
export function showStartPage(page: PagerPageKey): boolean {
  if (shown.show === null) return false;
  shown.show(page);
  return true;
}

export function subscribeStartPage(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}
