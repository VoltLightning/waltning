/** Native-only platform wiring for the phone-alone preview. */

import AsyncStorage from "@react-native-async-storage/async-storage";
import { createAppearance } from "@waltning/client/appearance/create-appearance";
import { previewResetEnabled } from "@waltning/client/appearance/preview-reset";
import { createDevicePreference } from "@waltning/client/device/create-device-preference";
import { createLastCapturePreference } from "@waltning/client/transactions/last-capture";
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
