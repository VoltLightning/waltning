/**
 * `useDayRows` — one day's entries, for the panel S04's Calendar opens under
 * its grid (§3).
 *
 * Through the port and keyed on the snapshot, for the reasons `useDayFlows`
 * gives: the day is the pager's own state, so a tap reads what it needs rather
 * than widening what a write recomputes for every subscriber.
 *
 * **Rows, not a rendered day.** Grouping them under a header and totalling them
 * is `ledger-days`' job, and this module may not reach into `transactions/`
 * (`module-boundaries`) — the same seam `useLedgerList` keeps, for the same
 * reason: a read that knew what a calendar looks like could be used by nothing
 * else.
 */

import type { AccountingDate } from "@waltning/core/date";
import { useMemo } from "react";
import type {
  PhoneLedgerController,
  PhoneLedgerPage,
  PhoneLedgerSnapshot,
} from "../create-phone-ledger/create-phone-ledger.ts";

export function useDayRows(
  ledger: PhoneLedgerController,
  date: AccountingDate,
  revision: PhoneLedgerSnapshot,
): PhoneLedgerPage["rows"] {
  return useMemo(() => {
    void revision;
    return ledger.readDayRows(date);
  }, [ledger, date, revision]);
}
