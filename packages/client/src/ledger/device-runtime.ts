/**
 * The runtime every real device hands `createPhoneLedger` — extracted, because
 * it was written twice.
 *
 * The phone and the browser differ in how they *open SQLite*, not in how they
 * read a clock or mint an id: `Intl` and `Date` are the same JavaScript on
 * both, and `randomId` already owns the one platform seam (`crypto`) with its
 * own polyfill story. Duplicating this per platform is how the two surfaces'
 * captured timezones drift a refactor apart.
 *
 * A **function**, not a constant, because `capture` closes over nothing and
 * `diagnostics` differs per caller — the app passes its own sink in.
 */

import { todayIn } from "@waltning/core/date";
import { type Id, type IdTable, id } from "@waltning/core/id";
import { randomId } from "@waltning/core/random";
import type { ClientDiagnostics } from "../diagnostics.ts";
import type { PhoneLedgerRuntime } from "./create-phone-ledger.ts";

export function deviceRuntime(diagnostics?: ClientDiagnostics): PhoneLedgerRuntime {
  return {
    ...(diagnostics ? { diagnostics } : {}),
    capture: () => {
      const at = new Date();
      const timeZone = Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC";
      return {
        date: todayIn(timeZone, at),
        timeZone,
        offsetMinutes: -at.getTimezoneOffset(),
        at,
      };
    },
    id: <Table extends IdTable>(): Id<Table> => id<Table>(randomId()),
  };
}
