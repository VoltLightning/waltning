/**
 * The app boundary's handle on the ledger — a context, not a singleton.
 *
 * The three preview screens each called `requirePhoneLedger()` inside their
 * component body, which is a module singleton wearing a function call: a
 * screen that reads one cannot render in a test, a diff preview, or any tree
 * that wants to hand it a different ledger. `architecture/11` already states
 * the rule for hooks — dependencies are parameters — and this is the same
 * rule for screens: the controller is *provided* where the platform is known
 * (the app's root layout, the one place that imports the platform-resolved
 * `phone-ledger` module) and *consumed* by screens that know nothing about
 * where it came from.
 *
 * The default is `null` and the consuming hook throws on it, because a screen
 * rendering against no ledger is a wiring error to surface, not a state to
 * design for — the platform variants guarantee a controller exists wherever a
 * route actually mounts.
 */

import { createContext, type ReactNode } from "react";
import type { PhoneLedgerController } from "./create-phone-ledger.ts";

export const LedgerContext = createContext<PhoneLedgerController | null>(null);

export function LedgerProvider({
  controller,
  children,
}: {
  controller: PhoneLedgerController;
  children: ReactNode;
}) {
  return <LedgerContext.Provider value={controller}>{children}</LedgerContext.Provider>;
}
