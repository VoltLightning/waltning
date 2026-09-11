/**
 * `useLedgerYears` — which years the ledger holds anything in, for the dot in
 * S04's year picker.
 *
 * **Read while the sheet is open, and not before.** `open` is the gate: the
 * grid is the only thing that asks, and a screen that read every year on every
 * render would scan the ledger to draw a sheet nobody had opened. Closed, the
 * answer is the empty set — no dots, and nothing to be stale.
 *
 * **One read for the whole grid rather than one per cell**, which is also why
 * this is a set: ten pages of paging is ninety questions asked of a Set that
 * was filled once.
 *
 * **`revision` is the snapshot itself, and it is read** — the port call says
 * nothing about the ledger having changed, so naming the snapshot makes the
 * dependency real rather than a lint suppression.
 */

import { useMemo } from "react";
import type {
  PhoneLedgerController,
  PhoneLedgerSnapshot,
} from "../create-phone-ledger/create-phone-ledger.ts";

const NONE: ReadonlySet<number> = new Set<number>();

export function useLedgerYears(
  ledger: PhoneLedgerController,
  open: boolean,
  revision: PhoneLedgerSnapshot,
): ReadonlySet<number> {
  return useMemo(() => {
    void revision;
    return open ? new Set(ledger.readLedgerYears()) : NONE;
  }, [ledger, open, revision]);
}
