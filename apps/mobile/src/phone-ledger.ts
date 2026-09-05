// TypeScript does not apply Metro's platform suffixes. Metro selects the
// native or web variant at bundle time — both are real ledgers now — and this
// platform-bound fallback exists only for non-Metro tooling (tsc, vitest),
// which must never reach a ledger through a module import: a test injects a
// controller through <LedgerProvider>.
import type { PhoneLedgerController } from "@waltning/client/ledger/create-phone-ledger";
import { Platform } from "react-native";

export const PHONE_LEDGER_AVAILABLE = false as const;

export type PhoneLedgerStartup =
  | { status: "ready"; controller: PhoneLedgerController }
  | { status: "failed"; error: Error };

let startup: PhoneLedgerStartup | null = null;

/** Always `failed`: this variant exists only where Metro resolved neither real one. */
export function startPhoneLedger(): PhoneLedgerStartup {
  if (!startup) {
    startup = {
      status: "failed",
      error: new Error(
        `no bundler resolved a platform ledger for ${Platform.OS} — tests inject a controller via <LedgerProvider>`,
      ),
    };
  }
  return startup;
}

/** Always "ready": the fallback's job is to typecheck, and to throw if rendered. */
export function usePhoneLedgerReady(): boolean {
  return true;
}
