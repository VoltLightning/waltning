/**
 * What the hardware back button and a re-tap on the tab bar do — decided here
 * as a pure function of where the reader is (`S04` §2), and acted on by
 * `use-hardware-back.ts` and `use-tab-bar-items.tsx` in `apps/mobile`, which name
 * the router.
 *
 * A pushed screen or an open sheet is not in this function: the stack owns
 * those, and `use-hardware-back.ts` does not answer when one is on top.
 */

import type { PagerPageKey } from "../use-pager-date/pager-date.ts";

export type TabName = "today" | "accounts" | "ledger" | "counterparties" | "settings";

export type BackAction =
  | { kind: "exit" }
  | { kind: "tab"; tab: "today" }
  | { kind: "page"; page: "summary" };

/**
 * Back from a tab's root. Another tab returns to Start, keeping Start's page;
 * Start on a page other than the overview returns to the overview; Start's
 * overview exits, which is the platform's own behaviour.
 */
export function decideBack(where: { tab: TabName; page: PagerPageKey }): BackAction {
  if (where.tab !== "today") return { kind: "tab", tab: "today" };
  if (where.page !== "summary") return { kind: "page", page: "summary" };
  return { kind: "exit" };
}

export type ReselectAction = { kind: "overview" } | { kind: "scroll-top" };

/** A tap on the tab that is already selected. */
export function decideReselect(where: { tab: TabName; page: PagerPageKey }): ReselectAction {
  if (where.tab === "today" && where.page !== "summary") return { kind: "overview" };
  return { kind: "scroll-top" };
}
