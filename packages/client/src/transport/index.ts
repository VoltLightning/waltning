/**
 * How any surface reaches the server. **No React here** — a script, a test or
 * `tools/e2e` imports this and pulls in none.
 *
 * Domain-free, like `query/`: the transport does not know what an account is.
 */

export {
  ApiBaseUrlError,
  type BaseUrlInputs,
  resolveApiBaseUrl,
  type Surface,
} from "./base-url.ts";
export { DEV_BUILD, isStaleBundle } from "./build.ts";
export { type ApiClient, createApiClient } from "./client.ts";
