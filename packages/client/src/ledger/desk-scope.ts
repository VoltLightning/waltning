/**
 * The desk band's scope segment (`S01` §3, `DESK1`'s `SegmentControl`), as a
 * value the band and the dashboard both read.
 *
 * **A device preference, not screen state.** The control lives in `DeskBand`
 * and the widgets that honour it live under `<TabSlot>`, so the two are
 * siblings with a router between them — `useState` in the band could only ever
 * drive the band. It is also not a registry write: choosing what you are
 * looking at moves nothing in the ledger, which is the same argument §7.0
 * makes for the display currency and §2.9 for the floating button's corner.
 *
 * **Not every widget can honour it, and that is what `S01` §3 already says**:
 * *"with a scope segment in the shell that a widget may or may not inherit,
 * the frame has to be local."* So this is the shell's stated intent, each
 * widget states the scope it actually applied in its own header, and the two
 * are allowed to differ as long as both are on screen.
 */

import type { LedgerScope } from "@waltning/core/money";
import {
  createDevicePreference,
  type DevicePreferenceStore,
} from "../device/create-device-preference.ts";
import type { ClientDiagnostics } from "../diagnostics.ts";

const SCOPES: readonly LedgerScope[] = ["all", "mine", "shared", "business"];

/** `null` for anything else — a corrupt string on disk falls back to the default, never throws. */
export function parseDeskScope(raw: string): LedgerScope | null {
  return SCOPES.find((scope) => scope === raw) ?? null;
}

export function serializeDeskScope(value: LedgerScope): string {
  return value;
}

/** `S01`'s own default: the whole ledger, which is what the band has always shown. */
export const DEFAULT_DESK_SCOPE: LedgerScope = "all";

export function createDeskScopePreference(
  store: DevicePreferenceStore,
  diagnostics?: ClientDiagnostics,
) {
  return createDevicePreference<LedgerScope>(
    store,
    { parse: parseDeskScope, serialize: serializeDeskScope },
    diagnostics,
  );
}
