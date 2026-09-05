/** Native-only platform wiring for the phone-alone preview. */

import AsyncStorage from "@react-native-async-storage/async-storage";
import { createAppearance } from "@waltning/client/appearance/create-appearance";
import { previewResetEnabled } from "@waltning/client/appearance/preview-reset";
import { createDisplayCurrencyPreference } from "@waltning/client/currencies/display-currency";
import { createDevicePreference } from "@waltning/client/device/create-device-preference";
import { createDeskScopePreference } from "@waltning/client/ledger/desk-scope";
import { createLastCapturePreference } from "@waltning/client/transactions/last-capture";
import { pivotCurrency } from "@waltning/core/currencies";
import type { CurrencyCode } from "@waltning/core/money";
import {
  type FloatPosition,
  parseFloatPosition,
  serializeFloatPosition,
} from "@waltning/ui/shell/float-geometry";
import * as Haptics from "expo-haptics";
import { getLocales } from "expo-localization";
import { mobileDiagnostics } from "./diagnostics.ts";

const APPEARANCE_KEY = "waltning.appearance";

export const appearance = createAppearance(
  {
    get: () => AsyncStorage.getItem(APPEARANCE_KEY),
    set: (preference) => AsyncStorage.setItem(APPEARANCE_KEY, preference),
  },
  mobileDiagnostics,
);

const FLOAT_POSITION_KEY = "waltning.floatPosition";

/** Where the floating add button sits on this device — §2.9's device preference. */
export const floatPosition = createDevicePreference<FloatPosition>(
  {
    get: () => AsyncStorage.getItem(FLOAT_POSITION_KEY),
    set: (value) => AsyncStorage.setItem(FLOAT_POSITION_KEY, value),
  },
  { parse: parseFloatPosition, serialize: serializeFloatPosition },
  mobileDiagnostics,
);

const DESK_SCOPE_KEY = "waltning.deskScope";

/**
 * `S01` §3's scope segment — `DeskBand` writes it, `dashboard-screen.tsx`
 * reads it. See the web half's own note: a device preference, never a
 * registry write, and the only thing the band and the widgets under
 * `<TabSlot>` can both reach.
 */
export const deskScope = createDeskScopePreference(
  {
    get: () => AsyncStorage.getItem(DESK_SCOPE_KEY),
    set: (value) => AsyncStorage.setItem(DESK_SCOPE_KEY, value),
  },
  mobileDiagnostics,
);

export const PREVIEW_RESET_ENABLED = previewResetEnabled(
  __DEV__,
  process.env["EXPO_PUBLIC_ENABLE_PREVIEW_RESET"],
);

const LAST_CAPTURE_KEY = "waltning.lastCapture";

/** D4b's last-used account, within S05 §9.2's four-hour window. */
export const lastCapture = createLastCapturePreference(
  {
    get: () => AsyncStorage.getItem(LAST_CAPTURE_KEY),
    set: (value) => AsyncStorage.setItem(LAST_CAPTURE_KEY, value),
  },
  mobileDiagnostics,
);

const DISPLAY_CURRENCY_KEY = "waltning.displayCurrency";

/**
 * H1 — the live pivot, wired by `phone-ledger.native.ts` / `phone-ledger.web.ts`
 * once their ledger session exists. This file loads first (both ledger files
 * import `displayCurrency` from here), so the reader starts as "nothing yet"
 * and is replaced exactly once `setLivePivotReader` runs — never re-imported
 * the other way, which would cycle `platform.ts` through the ledger files.
 */
let livePivotReader: () => CurrencyCode | null = () => null;

/** Called once by the phone's ledger session: `currencies.find(isPivot)` over its live snapshot. */
export function setLivePivotReader(reader: () => CurrencyCode | null): void {
  livePivotReader = reader;
}

/**
 * M2 — the same indirection as `livePivotReader`, for the ledger's write
 * notifications. `displayCurrency`'s own `subscribe` calls through this on
 * every mount, so it always reaches whatever `setLivePivotSubscriber`
 * currently holds — the real `phoneLedger.subscribe` once the ledger session
 * has wired it, a no-op before that.
 */
let livePivotSubscribe: (listener: () => void) => () => void = () => () => {};

/** Called once by the phone's ledger session: its own controller's `subscribe`, so `change_pivot` reaches a mounted display-currency consumer live. */
export function setLivePivotSubscriber(subscribe: (listener: () => void) => () => void): void {
  livePivotSubscribe = subscribe;
}

/**
 * `SPEC.md` §7.0's header toggle — a device preference, never a registry
 * write. The live pivot (`livePivotReader`) is the fallback until something
 * is chosen or `initializeFromPinned` runs; `pivotCurrency.code`
 * (`@waltning/core/currencies` — USD) is only the seed used before the
 * ledger session is ready to answer at all (H1 — a fresh install whose
 * ledger pivot is PLN must render PLN, not this build-time seed).
 */
export const displayCurrency = createDisplayCurrencyPreference(
  {
    get: () => AsyncStorage.getItem(DISPLAY_CURRENCY_KEY),
    set: (value) => AsyncStorage.setItem(DISPLAY_CURRENCY_KEY, value),
  },
  () => livePivotReader(),
  pivotCurrency.code,
  {
    subscribeToLedger: (listener) => livePivotSubscribe(listener),
    diagnostics: mobileDiagnostics,
  },
);

/** S05 §7: haptic on Save. `platform.ts`'s web half no-ops this same name. */
export function saveHaptic(): void {
  void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
}

/**
 * The device's ordered language preferences.
 *
 * **A platform read, so it lives here** — `expo-localization` names a platform
 * and `architecture/11` says that is the whole test for this file. What it
 * returns is BCP-47 tags in the order the person set them; choosing among them
 * is `ui/i18n/locales`'s `resolveLocale`, which is pure and tested.
 *
 * Read once at module scope rather than per render: `getLocales()` is a
 * synchronous bridge call, and the system language cannot change without
 * restarting the app.
 */
export const DEVICE_LOCALES: readonly string[] = getLocales().map((locale) => locale.languageTag);

/**
 * `N`'s own hotkey — `platform.ts`'s web half. A phone has no hardware
 * keyboard listening globally the way a browser tab does (§9's "no keypad, no
 * dock" is the *desk* command bar's own web-only home,
 * `screens/S05-quick-add.md` §3), so the native build never wires this and
 * `tabs-shell.tsx`'s own `DeskCommandBar` calls the identical name for nothing.
 */
export function subscribeCommandBarHotkey(_onTrigger: () => void): () => void {
  return () => {};
}
