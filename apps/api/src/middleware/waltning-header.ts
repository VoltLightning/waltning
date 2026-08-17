/**
 * Rule 0's first condition, stamped on every response including errors.
 *
 * A captive portal answers 200 with HTML to anything. The client must be able
 * to reject that *before* it looks at the status code, and this header is the
 * cheapest of the three signals it checks (`architecture/09`).
 *
 * The name comes from `@waltning/core`, where the client also reads it. It was
 * declared here, one string, and the client would have had a second copy — a
 * rename would have looked complete, passed every test on this side, and left
 * a client that accepts any response at all.
 */

import { WALTNING_HEADER } from "@waltning/core";
import type { MiddlewareHandler } from "hono";
import { BUILD } from "../config/build.ts";

export const waltningHeader: MiddlewareHandler = async (c, next) => {
  await next();
  // **After** the handler, not before. The tRPC adapter returns a Response it
  // constructed itself, which replaces anything set on the way in — so setting
  // the header first left it missing on exactly the responses the outbox drain
  // inspects. Rule 0 fails open in the worst possible place if this regresses,
  // which is why there is a header assertion per route.
  c.header(WALTNING_HEADER, BUILD);
};
