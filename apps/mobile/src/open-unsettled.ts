/**
 * Where the unsettled banner's action lands — the route half of §8's clearing
 * banner, written once.
 *
 * `packages/client`'s `unsettledBannerModel` decides *what* to open and hands
 * back an `UnsettledOpenTarget` — the pot. Turning that into a route is the
 * app's job, since a `pathname` is a thing only `apps/mobile` knows, so it
 * stops here rather than in the hook.
 *
 * **It goes to S36, not to a transaction.** J08 §4: the banner is about a
 * balance that has not been attributed to anybody, and allocating it is the
 * one action that answers it. Opening the oldest row instead was what the
 * app could do before a screen existed that could spend the pot down.
 *
 * **One function, because three screens ask.** `today-screen.tsx`,
 * `counterparties-screen.tsx` and `dashboard-screen.tsx` all render the banner, and all
 * three had written the same two-branch `router.push` against the raw
 * snapshot row — which is how `S04` §3's rule (*"straight to the unallocated
 * transaction, not to a list"*) came to be stated in three places that could
 * drift apart one at a time. The model already answers the question; this
 * answers where, once.
 */

import type { UnsettledOpenTarget } from "@waltning/client/ledger/use-unsettled-banner";
import { router } from "expo-router";

export function openUnsettled(target: UnsettledOpenTarget) {
  router.push({ pathname: "/allocate", params: { account: target.accountId } });
}
