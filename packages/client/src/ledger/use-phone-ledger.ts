import { useSyncExternalStore } from "react";
import type { PhoneLedgerController, PhoneLedgerSnapshot } from "./create-phone-ledger.ts";

export function usePhoneLedger(controller: PhoneLedgerController): PhoneLedgerSnapshot {
  return useSyncExternalStore(controller.subscribe, controller.getSnapshot, controller.getSnapshot);
}
