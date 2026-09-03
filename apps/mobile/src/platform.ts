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
import { createDevicePreference } from "@waltning/client/device/create-device-preference";
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
