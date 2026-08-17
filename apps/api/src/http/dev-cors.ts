/**
 * Cross-origin access, for local development only.
 *
 * **In production there is no cross-origin request to allow.** Caddy serves the
 * web bundle and proxies `/trpc/*` to this process on the same host name
 * (§5.1), so the browser never sees a second origin and CORS never enters the
 * picture. This file exists because the *dev* setup is different in exactly one
 * respect: Metro serves the bundle on `:8081` and the API answers on `:3000`,
 * which the browser treats as two origins.
 *
 * That makes this a development affordance sitting on the one surface whose
 * whole security argument is "nothing is served on a public interface". Three
 * properties keep it from becoming a hole:
 *
 *  - **Off unless asked.** No `DEV_CORS_ORIGIN`, no middleware — not a
 *    permissive default that production is expected to override. A setting you
 *    must remember to turn off is one that ships on.
 *  - **No wildcard, ever.** `*` is rejected at startup rather than accepted
 *    quietly, because a wildcard here means any page on the internet the
 *    operator visits can call this API through their own browser.
 *  - **Loopback only.** The web bundle runs on the same machine as the API in
 *    every case this supports. A native client — simulator or phone — sends no
 *    `Origin` and is unaffected by any of this, so a LAN address here could
 *    only ever widen the browser's reach, never fix a device.
 */

import { NONCE_HEADER, WALTNING_HEADER } from "@waltning/core";
import type { MiddlewareHandler } from "hono";
import { cors } from "hono/cors";

/** `http://localhost:8081` / `http://127.0.0.1:8081` and nothing else. */
const LOOPBACK_ORIGIN = /^http:\/\/(?:localhost|127\.0\.0\.1)(?::\d{1,5})?$/;

export class DevCorsConfigError extends Error {}

/**
 * Parses the setting into an origin list, or throws.
 *
 * Throwing means the process does not start. That is deliberate: a bad value
 * here is a misconfigured security boundary, and the alternatives are to ignore
 * it (the operator believes CORS is on when it is not) or to widen it (the
 * operator believes it is narrow when it is not). Both are silent; refusing to
 * boot is not.
 */
export function parseDevCorsOrigins(raw: string | undefined): readonly string[] {
  if (!raw) return [];

  const origins = raw
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);

  for (const origin of origins) {
    if (origin === "*") {
      throw new DevCorsConfigError(
        "DEV_CORS_ORIGIN must not be '*' — name the dev origin explicitly",
      );
    }
    if (!LOOPBACK_ORIGIN.test(origin)) {
      throw new DevCorsConfigError(
        `DEV_CORS_ORIGIN must be a loopback origin, got '${origin}'. ` +
          "Native clients send no Origin and need no entry here.",
      );
    }
  }

  return origins;
}

/**
 * The middleware, or `null` when the setting is absent.
 *
 * `null` rather than a no-op middleware so the caller mounts nothing at all —
 * the difference is visible in the route table, and "is CORS on" is answered by
 * looking rather than by reading a config.
 */
export function devCors(raw: string | undefined): MiddlewareHandler | null {
  const origins = parseDevCorsOrigins(raw);
  if (origins.length === 0) return null;

  return cors({
    origin: [...origins],
    allowMethods: ["GET", "POST", "OPTIONS"],
    // `content-type` for tRPC's JSON POSTs; the nonce header so Rule 0's third
    // check can be sent from the browser once §5.2 issues one.
    allowHeaders: ["content-type", NONCE_HEADER],
    // The client must be able to *read* the header it authenticates on.
    // Without this, a cross-origin fetch sees no `x-waltning` at all and Rule 0
    // rejects every response as captive — correct behaviour, wrong cause, and
    // it presents as "the server is down" rather than as a missing setting.
    exposeHeaders: [WALTNING_HEADER],
    credentials: false,
  });
}
