/**
 * **The forced file.** Everything Expo-specific about this client, in one place.
 *
 * `architecture/11`: an app is a delivery mechanism, not a place logic lives.
 * The seam is *does this file name a platform* — and these are the only lines in
 * the client that do. `Platform.OS`, `__DEV__` and `EXPO_PUBLIC_*` exist in
 * Expo and not in Vite, which reads `import.meta.env` instead.
 *
 * An `apps/web` written tomorrow needs its own version of this file and nothing
 * else from `apps/mobile/src/`. That is the whole point: when the §14.6 fork is
 * taken, this is the size of the duplication.
 */

// The API client that used to live here — `resolveApiBaseUrl`, `createApiClient`,
// `isStaleBundle` — left with the API-reading dashboard: the browser preview
// reads its own ledger now, and the API surface returns with `#e7`. The
// helpers kept their homes and their tests in `packages/client/src/transport/`.
import AsyncStorage from "@react-native-async-storage/async-storage";
import { createAppearance } from "@waltning/client/appearance/create-appearance";
import { previewResetEnabled } from "@waltning/client/appearance/preview-reset";
import { createDisplayCurrencyPreference } from "@waltning/client/currencies/display-currency";
import { createDevicePreference } from "@waltning/client/device/create-device-preference";
import { createLastCapturePreference } from "@waltning/client/transactions/last-capture";
import { pivotCurrency } from "@waltning/core/currencies";
import type { CurrencyCode } from "@waltning/core/money";
import {
  type FloatPosition,
  parseFloatPosition,
  serializeFloatPosition,
} from "@waltning/ui/shell/float-geometry";
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
  mobileDiagnostics,
);

/**
 * Save's haptic — a no-op on the web build.
 *
 * `expo-haptics` names a platform the same way `expo-localization` does above:
 * its binding is native, and the web half of this seam is simply nothing —
 * pressing Save on a browser has no haptic engine to reach for. Kept as a
 * function rather than a conditional import so `quick-add-screen.tsx` calls
 * one name on every platform and never asks which build it is in.
 */
export function saveHaptic(): void {}

/**
 * The browser's ordered language preferences.
 *
 * **`navigator.languages`, not `expo-localization`** — this is the web half of
 * the seam, and the browser answers the question itself. Reaching for the Expo
 * module here would pull `expo-modules-core` into the web bundle for a value
 * the platform already has, and its native binding does not exist off-device:
 * importing it is what broke `platform.test.tsx`, the test that exists to prove
 * these platform reads are wired at all.
 *
 * Guarded because `navigator` is absent in a Node render and `languages` is
 * absent in older engines. An empty list is a real answer, and `resolveLocale`
 * falls back to English on one.
 */
export const DEVICE_LOCALES: readonly string[] =
  typeof navigator === "undefined" ? [] : [...(navigator.languages ?? [])];
