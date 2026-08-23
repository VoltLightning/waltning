/** Native-only platform wiring for the phone-alone preview. */

import AsyncStorage from "@react-native-async-storage/async-storage";
import { createAppearance } from "@waltning/client/appearance/create-appearance";
import { previewResetEnabled } from "@waltning/client/appearance/preview-reset";

const APPEARANCE_KEY = "waltning.appearance";

export const appearance = createAppearance({
  get: () => AsyncStorage.getItem(APPEARANCE_KEY),
  set: (preference) => AsyncStorage.setItem(APPEARANCE_KEY, preference),
});

export const PREVIEW_RESET_ENABLED = previewResetEnabled(
  __DEV__,
  process.env["EXPO_PUBLIC_ENABLE_PREVIEW_RESET"],
);
