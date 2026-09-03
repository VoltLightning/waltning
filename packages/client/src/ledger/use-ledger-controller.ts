/**
 * The consuming half of `ledger-provider.tsx` — see there for why a context
 * and not a singleton. Throwing on the default is deliberate: `null` here
 * means a route mounted outside the provider, which is a wiring bug the first
 * render should name, not an absence to render around.
 */

import { useContext } from "react";
import type { PhoneLedgerController } from "./create-phone-ledger.ts";
import { LedgerContext } from "./ledger-provider.tsx";

export function useLedgerController(): PhoneLedgerController {
  const controller = useContext(LedgerContext);
  if (!controller) {
    throw new Error(
      "no ledger controller in context — wrap the tree in <LedgerProvider> at the app boundary",
    );
  }
  return controller;
}
