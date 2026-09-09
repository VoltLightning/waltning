/**
 * `useDayFlows` — §5's figure cut by day, for whatever period is asked for
 * (S04 §3).
 *
 * **Rows, not a grid.** Folding them into a calendar's weeks or a year's twelve
 * months would make this reach into `transactions/`, and `module-boundaries`
 * refuses that for a good reason: a read hook that knew what a calendar looks
 * like could not be used by anything that is not one. The folds live beside
 * their own models and the screen composes the two — the same shape
 * `useLedgerList` already has.
 *
 * **Read through the port, not from the snapshot.** The period is the screen's
 * own state, so a swipe reads what it needs rather than widening what a write
 * recomputes for every subscriber — the argument `readPeriodSpend` makes for
 * taking its period as an argument.
 *
 * **`revision` is the snapshot itself, and it is read.** The port call says
 * nothing about the ledger having changed, so naming the snapshot makes that
 * dependency real rather than a lint suppression — and says what the result is
 * valid as of.
 */

import type * as money from "@waltning/core/money";
import { useMemo } from "react";
import type {
  PhoneLedgerController,
  PhoneLedgerSnapshot,
} from "../create-phone-ledger/create-phone-ledger.ts";

export function useDayFlows(
  ledger: PhoneLedgerController,
  period: money.Period,
  revision: PhoneLedgerSnapshot,
): readonly money.DayFlowRow[] {
  return useMemo(() => {
    void revision;
    return ledger.readDayFlows(period);
  }, [ledger, period, revision]);
}
