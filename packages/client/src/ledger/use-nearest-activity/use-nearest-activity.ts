/**
 * `useNearestActivity` — where the entries are, for a month that has none.
 *
 * **Asked only from an empty month.** `ask` is the gate, and it is the whole
 * point: a month holding rows has nothing to offer a reader who can already see
 * them, and the two index seeks this costs should not be paid on every render
 * of a month that is fine.
 *
 * **`revision` is the snapshot itself, and it is read** — the port call says
 * nothing about the ledger having changed, so naming the snapshot makes the
 * dependency real rather than a lint suppression.
 */

import type * as money from "@waltning/core/money";
import { useMemo } from "react";
import type {
  PhoneLedgerController,
  PhoneLedgerSnapshot,
  PhoneNearestActivity,
} from "../create-phone-ledger/create-phone-ledger.ts";

export function useNearestActivity(
  ledger: PhoneLedgerController,
  period: money.Period,
  ask: boolean,
  revision: PhoneLedgerSnapshot,
): PhoneNearestActivity | null {
  return useMemo(() => {
    void revision;
    return ask ? ledger.readNearestActivity(period) : null;
  }, [ledger, period, ask, revision]);
}
