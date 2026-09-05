/**
 * §8's unsettled clearing banner, as a model — the shape `S04` §3 draws and
 * `S01` §4 draws again beside `WidgetGrid`.
 *
 * **Extracted at the third use.** `today-screen.tsx` wrote it, `debt-screen.tsx`
 * repeated its shape, and `S01`'s desk dashboard is the third — at which point
 * "no abstraction before the third use" has fired and a message or FIFO fix
 * landing in three files is the cost of not doing this. The split follows
 * `architecture/11`: everything derived lives here, in `packages/client`, and
 * nothing here renders; `packages/ui`'s `<UnsettledBanner>` turns this into
 * words and a `Banner`. A screen composes the two and owns the navigation,
 * because where *Open* lands is a route and routes are the app's.
 *
 * The four rules the original grew, each still tested through the screens:
 *
 * - **One banner, never a stack** (`S04` §3, `Banner`'s own "page-level, one
 *   tone, one action"): a second unsettled account folds into `more`.
 * - **H2** — the oldest open entry can be the account's own opening balance
 *   rather than a transaction. That entry has no payee, so it reads
 *   differently and lands on the filtered ledger instead of a detail screen.
 * - **H3** — with more than one entry open, the oldest one's remainder can be
 *   less than the whole account balance; showing the balance beside that
 *   payee's name would overstate what the leg accounts for.
 * - **`openTarget`** is a description, not a route. `S04` §3: *"Tapping the
 *   unsettled banner goes straight to the unallocated transaction, not to a
 *   list"* — the account fallback is only for a leg §8's fold did not hand
 *   back an id for.
 */

import type { Id } from "@waltning/core/id";
import * as money from "@waltning/core/money";
import { useMemo } from "react";
import type { PhoneClearingAccount } from "./create-phone-ledger.ts";

/** Where *Open* goes — resolved to a route by the screen, never here. */
export type UnsettledOpenTarget =
  | { kind: "transaction"; transactionId: Id<"transactions"> }
  | { kind: "account"; accountId: string };

export type UnsettledBannerModel = {
  name: string;
  currency: money.CurrencyCode;
  decimals: number;
  /** The clearing account's whole unsettled balance. */
  balance: money.Money;
  /** The oldest open entry's own unconsumed magnitude — equal to `balance` unless a second entry is open (H3). */
  remainder: money.Money;
  payee: string | null;
  /** H2 — the oldest open entry is the account's opening balance, which never has a payee. */
  isOpening: boolean;
  /** H3 — `remainder` and `balance` are different figures, so both are worth naming. */
  remainderDiffers: boolean;
  /** Other unsettled clearing accounts beyond this one. */
  more: number;
  openTarget: UnsettledOpenTarget;
};

/** `null` when nothing is unsettled — the banner is absent, not empty (`S04` §3: "only when non-zero"). */
export function unsettledBannerModel(
  accounts: readonly PhoneClearingAccount[],
): UnsettledBannerModel | null {
  const [unsettled] = accounts;
  if (!unsettled) return null;

  const remainder = unsettled.oldestUnconsumedRemainder ?? unsettled.balance;
  return {
    name: unsettled.name,
    currency: unsettled.currency,
    decimals: unsettled.decimals,
    balance: unsettled.balance,
    remainder,
    payee: unsettled.oldestUnconsumedPayee ?? null,
    isOpening: unsettled.oldestUnconsumedTransactionId === null,
    remainderDiffers:
      unsettled.oldestUnconsumedRemainder != null &&
      !money.eq(unsettled.oldestUnconsumedRemainder, unsettled.balance),
    more: accounts.length - 1,
    openTarget:
      unsettled.oldestUnconsumedTransactionId === null
        ? { kind: "account", accountId: unsettled.accountId }
        : { kind: "transaction", transactionId: unsettled.oldestUnconsumedTransactionId },
  };
}

/** The model, memoised on the snapshot's own list — a hook that takes its dependency, never a singleton. */
export function useUnsettledBanner(
  accounts: readonly PhoneClearingAccount[],
): UnsettledBannerModel | null {
  return useMemo(() => unsettledBannerModel(accounts), [accounts]);
}
