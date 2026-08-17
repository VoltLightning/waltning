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

/**
 * This bundle's own build, injected at image build time by `web.Dockerfile`
 * from the same `git rev-parse` the API image gets.
 *
 * `"dev"` from Metro, where there is no image and no skew to detect.
 */
export const CLIENT_BUILD: string = process.env["EXPO_PUBLIC_BUILD_SHA"] || "dev";

/**
 * Whether the server is running different code from this bundle.
 *
 * `architecture/05`: a browser holds an `index.html` from before a deploy and
 * keeps a bundle whose `opVersion` the server no longer accepts. The failure
 * surfaces as an unexplained rejection, at a moment when nothing suggests the
 * page is stale.
 *
 * `/healthz` has reported `build` since the probe was written and **nothing
 * compared it** — the value was displayed and discarded, which looks exactly
 * like the check existing.
 *
 * Either side reading `"dev"` means no image was involved, so there is nothing
 * to compare: in development the bundle and the server change independently by
 * design, and reporting skew there would be noise that teaches people to
 * ignore it.
 */
export function isStaleBundle(serverBuild: string): boolean {
  if (CLIENT_BUILD === "dev" || serverBuild === "dev") return false;
  return CLIENT_BUILD !== serverBuild;
}
