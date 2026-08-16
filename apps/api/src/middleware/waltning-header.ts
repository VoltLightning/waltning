/**
 * Rule 0's first condition, stamped on every response including errors.
 *
 * A captive portal answers 200 with HTML to anything. The client must be able
 * to reject that *before* it looks at the status code, and this header is the
 * cheapest of the three signals it checks (`architecture/09`).
 */

import type { MiddlewareHandler } from "hono";
import { BUILD, WALTNING_HEADER } from "../config/build.ts";

export const waltningHeader: MiddlewareHandler = async (c, next) => {
  await next();
  // **After** the handler, not before. The tRPC adapter returns a Response it
  // constructed itself, which replaces anything set on the way in — so setting
  // the header first left it missing on exactly the responses the outbox drain
  // inspects. Rule 0 fails open in the worst possible place if this regresses,
  // which is why there is a header assertion per route.
  c.header(WALTNING_HEADER, BUILD);
};
