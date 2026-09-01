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

import AsyncStorage from "@react-native-async-storage/async-storage";
import { createAppearance } from "@waltning/client/appearance/create-appearance";
import { previewResetEnabled } from "@waltning/client/appearance/preview-reset";
import { resolveApiBaseUrl } from "@waltning/client/transport/base-url";
import { isStaleBundle as compareBuilds } from "@waltning/client/transport/build";
import { createApiClient } from "@waltning/client/transport/client";
import { Platform } from "react-native";
import { mobileDiagnostics } from "./diagnostics.ts";

const APPEARANCE_KEY = "waltning.appearance";

export const appearance = createAppearance(
  {
    get: () => AsyncStorage.getItem(APPEARANCE_KEY),
    set: (preference) => AsyncStorage.setItem(APPEARANCE_KEY, preference),
  },
  mobileDiagnostics,
);

export const PREVIEW_RESET_ENABLED = previewResetEnabled(
  __DEV__,
  process.env["EXPO_PUBLIC_ENABLE_PREVIEW_RESET"],
);

export const API_BASE_URL: string = resolveApiBaseUrl({
  configured: process.env["EXPO_PUBLIC_API_URL"],
  surface: Platform.OS === "web" ? "web" : "native",
  dev: __DEV__,
});

/**
 * `nonce` returns null because §5.2 has no sessions yet — passed explicitly so
 * "no session" never reads the same as "nobody wired the check".
 */
export const api = createApiClient(API_BASE_URL, {
  nonce: () => null,
  diagnostics: mobileDiagnostics,
});

/** This bundle's own build, injected by `web.Dockerfile` at image build time. */
export const CLIENT_BUILD: string = process.env["EXPO_PUBLIC_BUILD_SHA"] || "dev";

/** The comparison is shared; only the value it reads is platform-bound. */
export function isStaleBundle(serverBuild: string): boolean {
  return compareBuilds(CLIENT_BUILD, serverBuild);
}

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
