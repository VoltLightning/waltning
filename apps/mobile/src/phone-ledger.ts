// TypeScript does not apply Metro's platform suffixes. Metro selects the
// native or web variant at bundle time; this platform-bound fallback gives
// non-Metro tooling the same unavailable contract as the browser.
import type { PhoneLedgerController } from "@waltning/client/ledger";
import { Platform } from "react-native";

export const PHONE_LEDGER_AVAILABLE = false as const;

export function requirePhoneLedger(): PhoneLedgerController {
  throw new Error(
    `The phone-alone ledger preview is unavailable on ${Platform.OS}; use iOS or Android`,
  );
}
