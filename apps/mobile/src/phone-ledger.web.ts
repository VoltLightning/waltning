import { Platform } from "react-native";

export const PHONE_LEDGER_AVAILABLE = false as const;

export function requirePhoneLedger(): never {
  throw new Error(
    `The phone-alone ledger preview is unavailable on ${Platform.OS}; use iOS or Android`,
  );
}
