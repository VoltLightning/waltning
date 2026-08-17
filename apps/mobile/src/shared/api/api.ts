/**
 * The app's one client, and the only place the platform is asked anything.
 *
 * A module-level singleton rather than a React context: there is one API and
 * one session, no test needs a second, and a provider would be an abstraction
 * ahead of its second use. When authentication arrives and the client needs a
 * per-session nonce, `ruleZeroFetch` already reads that through a callback —
 * the client itself does not have to be rebuilt, so it does not have to move.
 *
 * Resolution happens at import, which means a native build with no configured
 * URL fails when the app starts rather than when a screen first fetches. That
 * is the louder of the two, and the failure is a build configuration mistake,
 * not a runtime condition.
 */

import { Platform } from "react-native";
import { resolveApiBaseUrl } from "./base-url.ts";
import { createApiClient } from "./client.ts";

export const API_BASE_URL: string = resolveApiBaseUrl({
  configured: process.env["EXPO_PUBLIC_API_URL"],
  surface: Platform.OS === "web" ? "web" : "native",
  dev: __DEV__,
});

/**
 * `nonce` returns null because §5.2 has no sessions yet — passed explicitly so
 * that "no session" never reads the same as "nobody wired the check".
 */
export const api = createApiClient(API_BASE_URL, { nonce: () => null });
