/**
 * Where the unsettled banner's action lands — the route half of §8's clearing
 * banner, written once.
 *
 * `packages/client`'s `unsettledBannerModel` decides *what* to open and hands
 * back an `UnsettledOpenTarget`: the oldest open entry's transaction, or the
 * account when that entry is an opening balance and has no transaction to
 * open (H2). Turning that description into a route is the app's job — a
 * `pathname` is a thing only `apps/mobile` knows — so it stops here rather
 * than in the hook.
 *
 * **One function, because three screens ask.** `today-screen.tsx`,
 * `debt-screen.tsx` and `dashboard-screen.tsx` all render the banner, and all
 * three had written the same two-branch `router.push` against the raw
 * snapshot row — which is how `S04` §3's rule (*"straight to the unallocated
 * transaction, not to a list"*) came to be stated in three places that could
 * drift apart one at a time. The model already answers the question; this
 * answers where, once.
 */

import type { UnsettledOpenTarget } from "@waltning/client/ledger/use-unsettled-banner";
import { router } from "expo-router";

export function openUnsettled(target: UnsettledOpenTarget) {
  if (target.kind === "transaction") {
    router.push({ pathname: "/transaction/[id]", params: { id: target.transactionId } });
    return;
  }
  router.push({ pathname: "/ledger", params: { account: target.accountId } });
}
