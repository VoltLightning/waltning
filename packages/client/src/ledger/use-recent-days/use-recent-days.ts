/**
 * `useRecentDays` — the latest page of the ledger, for S04's Summary.
 *
 * **The same read the List page walks, stopped after one page.** Summary used
 * to draw a five-row *Recent* window from `snapshot.recent`, which carries no
 * rate and so could state no day total — and drew it as one card headed
 * *Recent* with a *Show all* door into the page one swipe away. The deck draws
 * the last days as the List draws them: a kicker per day with the day's own
 * figure, and rows under it. One read, one fold (`toLedgerItems`), one
 * anatomy; the screen takes the first few days of the page.
 *
 * **`revision` is the snapshot itself, and it is read** — the port call says
 * nothing about the ledger having changed, so naming the snapshot makes the
 * dependency real rather than a lint suppression.
 */

import type { AccountingDate } from "@waltning/core/date";
import { useMemo } from "react";
import type {
  PhoneLedgerController,
  PhoneLedgerSnapshot,
  PhoneSearchTransaction,
} from "../create-phone-ledger/create-phone-ledger.ts";

export function useRecentDays(
  ledger: PhoneLedgerController,
  today: AccountingDate,
  revision: PhoneLedgerSnapshot,
): readonly PhoneSearchTransaction[] {
  return useMemo(() => {
    void revision;
    return ledger.readLedgerPage({ anchor: today, direction: "older" }).rows;
  }, [ledger, today, revision]);
}
