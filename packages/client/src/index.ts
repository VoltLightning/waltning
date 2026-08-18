/**
 * `@waltning/client` — how any surface talks to the server.
 *
 * **May import `react`. Must never import `react-native`.** That single line is
 * the design (`architecture/11`): React is a platform-neutral library and React
 * Native is a renderer, so every piece of client *behaviour* — transport,
 * cancellation, error classification, staleness — is shared by construction and
 * only rendering is negotiable. `tests/architecture.test.ts` refuses the import.
 *
 * The React-dependent half is the `./hooks` subpath, so a consumer that needs
 * only the transport pulls in no React at all.
 *
 * Rule 0 lives one layer down in `@waltning/core`, beside the protocol it
 * enforces, because the outbox drain will need it without needing any of this.
 */

/** Re-exported so a screen catches one class, from one package. */
export { CaptiveResponseError } from "@waltning/core";
export {
  ApiBaseUrlError,
  type BaseUrlInputs,
  resolveApiBaseUrl,
  type Surface,
} from "./base-url.ts";
export { DEV_BUILD, isStaleBundle } from "./build.ts";
export { type ApiClient, createApiClient } from "./client.ts";
