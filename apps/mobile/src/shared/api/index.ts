/**
 * `shared/api` — how this app talks to the server.
 *
 * Cross-feature by nature: every feature's `api/` folder calls through this
 * one client, and none of them knows how a response is authenticated. Rule 0
 * lives under here rather than in a feature because a rule enforced in one
 * feature is a rule the next feature does not have.
 */

/**
 * Re-exported from `@waltning/core` rather than defined here: screens catch it
 * to tell "the server refused" from "that was not the server", and importing it
 * from two places would eventually mean two error classes and an
 * `instanceof` that quietly stops matching.
 */
export { CaptiveResponseError } from "@waltning/core";
export { API_BASE_URL, api, CLIENT_BUILD, isStaleBundle } from "./api.ts";
export {
  ApiBaseUrlError,
  type BaseUrlInputs,
  resolveApiBaseUrl,
  type Surface,
} from "./base-url.ts";
export { type ApiClient, createApiClient } from "./client.ts";
