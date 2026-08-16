/**
 * tRPC wiring.
 *
 * The context here is deliberately thin — session and actor arrive with the
 * next card. What this file fixes now is the **error shape**, because
 * `architecture/09` Rule 1 depends on it: only errors carrying
 * `{error:{code,…}}` may put the client into `blocked`. If a domain refusal
 * ever leaves here in tRPC's default shape, the drain cannot tell it from a
 * proxy's 403 and will treat a permanent refusal as a transport blip forever.
 */

import { initTRPC } from "@trpc/server";
import type { Database } from "@waltning/db";
import { DomainError, type ErrorCode, STATUS_BY_CODE } from "../common/errors.ts";

export type Context = {
  /** Resolved lazily; absent when the database is unreachable. */
  db: Database | null;
  /** One id per request, in the logs and in the response. */
  requestId: string;
  now: Date;
};

const t = initTRPC.context<Context>().create({
  /**
   * tRPC serializes whatever this returns as `{"error": <shape>}`, so the
   * shape *is* the envelope's interior. Returning `code` as our domain string
   * — not tRPC's numeric code — is what makes `{error:{code,…}}` literally
   * true on the wire, which is what Rule 1 reads.
   */
  errorFormatter({ shape, error }) {
    const cause = error.cause;
    const code: ErrorCode = cause instanceof DomainError ? cause.code : mapTrpcCode(error.code);
    const details = cause instanceof DomainError ? cause.details : undefined;

    return {
      code,
      message: error.message,
      /**
       * Rebuilt rather than passed through.
       *
       * `shape.data` carries a **stack trace** outside production and an
       * `httpStatus` derived from tRPC's own code — so a duplicate name came
       * back as `validation` in the envelope and `500` with a stack beside it.
       * The status contradicted the envelope, and the stack is exactly the
       * kind of internal detail a response about a *payee name* should never
       * carry on a system whose whole argument is that the data stays yours.
       */
      data: {
        code,
        httpStatus: STATUS_BY_CODE[code],
        path: shape.data.path,
      },
      ...(details === undefined ? {} : { details }),
    };
  },
});

/** tRPC's own failures still have to speak the domain vocabulary. */
function mapTrpcCode(code: string): ErrorCode {
  switch (code) {
    case "BAD_REQUEST":
    case "PARSE_ERROR":
      return "validation";
    case "FORBIDDEN":
    case "UNAUTHORIZED":
      return "forbidden";
    case "NOT_FOUND":
      return "not_found";
    default:
      return "internal";
  }
}

export const router = t.router;
export const publicProcedure = t.procedure;
