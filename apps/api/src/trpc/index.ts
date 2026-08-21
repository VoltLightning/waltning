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

import { initTRPC, type TRPCError } from "@trpc/server";
import type { Database } from "@waltning/db";
import { ZodError } from "zod";
import {
  DomainError,
  type ErrorCode,
  type ErrorDetails,
  STATUS_BY_CODE,
} from "../common/errors.ts";

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
   * shape *is* the envelope's interior — and the domain code lives at
   * `error.data.code`, which is what Rule 1 reads.
   *
   * **The top-level `code` stays tRPC's number, and that is not a style
   * choice.** It was our domain string, which read better and made
   * `{error:{code,…}}` literally true — and it made every error in the system
   * unreadable by any tRPC client. `transformResult` rejects an error response
   * whose `error.code` is not a `number`, discarding the whole body and
   * throwing a bare "Unable to transform response from server": no code, no
   * details, no path.
   *
   * Nothing on this side could see it. The response was well-formed, the HTTP
   * status was right, and the suite asserted the body — which was correct. The
   * failure existed only in a client that parses it, so it took an end-to-end
   * check against a running server to surface at all, and it would have taken
   * down Rule 1 the moment anything tried to implement it: an error that
   * cannot be identified cannot be told from a proxy's, so a permanent refusal
   * would retry forever.
   */
  errorFormatter({ shape, error }) {
    const cause = error.cause;
    const code: ErrorCode =
      cause instanceof DomainError ? cause.code : mapTrpcCode(error.code, cause);
    const details = cause instanceof DomainError ? cause.details : fieldErrorsOf(cause);

    return {
      code: shape.code,
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

/**
 * tRPC's own failures still have to speak the domain vocabulary.
 *
 * **The discriminator is the cause, not the code**, and finding that out took
 * running it. `BAD_REQUEST` covers both "your values failed the schema" and
 * "your body is not JSON" — a truncated request from a dropped connection
 * arrives here as `BAD_REQUEST` with a `SyntaxError`, not as `PARSE_ERROR`.
 * Keying on the code alone therefore cannot tell a permanent input error from a
 * transport accident, whichever label you pick.
 *
 * A `ZodError` cause is the only positive evidence that the body parsed and the
 * *values* were wrong, which is the one situation `validation` describes and the
 * only one where `fieldErrors` can name anything.
 */
/**
 * Every tRPC code, classified. **A total map, not a switch with a default.**
 *
 * `mapTrpcCode` took `code: string`, so `error.code` — already a union of the
 * twenty keys tRPC defines — widened at the seam and the `default` arm swallowed
 * everything else. Three things followed: a typo like `"NOT_FOND"` compiled and
 * silently fell through, a tRPC upgrade adding a code inherited `internal`
 * without anyone deciding that, and nothing in the file said which codes had
 * actually been considered.
 *
 * `Record<TrpcCode, …>` makes each one a decision the compiler insists on. An
 * upgrade that adds a code fails the build, which is the correct outcome: the
 * `PARSE_ERROR` note below is a worked example of what mis-bucketing costs, and
 * inheriting a default is how you get it wrong without noticing.
 *
 * `TRPCError["code"]` rather than a deep import — the union is derived from the
 * error class this file already handles, so it cannot drift from what tRPC
 * actually throws.
 */
type TrpcCode = TRPCError["code"];

const DOMAIN_CODE_BY_TRPC_CODE: Record<TrpcCode, ErrorCode> = {
  /**
   * **Not `validation`, and this one loses writes.**
   *
   * A body that did not parse. `validation` is documented *never retry
   * unchanged*, so classifying this as one tells the outbox drain that a
   * dropped connection is a permanent input error and the write is discarded
   * having never reached an operation. Nothing about the input was wrong; the
   * bytes did not all arrive.
   *
   * `internal` is the existing retryable bucket, so nothing downstream needs
   * new vocabulary. A genuinely malformed request — a client bug rather than an
   * accident — then retries against its budget and ends `stalled`, which
   * `architecture/08` makes visible on S30. Visible and bounded beats silently
   * dropped.
   */
  PARSE_ERROR: "internal",

  /** Overridden below when the cause is a `ZodError`. See `mapTrpcCode`. */
  BAD_REQUEST: "internal",

  UNAUTHORIZED: "forbidden",
  FORBIDDEN: "forbidden",
  /** No credential will fix it, and the drain must not retry it as one. */
  PAYMENT_REQUIRED: "forbidden",

  NOT_FOUND: "not_found",

  /**
   * Retryable, every one. A method that is not supported *here* may be
   * supported by the build behind the next reconnect, and the rest are
   * transport or capacity — the cases `internal` exists for.
   */
  METHOD_NOT_SUPPORTED: "internal",
  TIMEOUT: "internal",
  CONFLICT: "internal",
  PRECONDITION_FAILED: "internal",
  PRECONDITION_REQUIRED: "internal",
  PAYLOAD_TOO_LARGE: "internal",
  UNSUPPORTED_MEDIA_TYPE: "internal",
  UNPROCESSABLE_CONTENT: "internal",
  TOO_MANY_REQUESTS: "internal",
  CLIENT_CLOSED_REQUEST: "internal",
  INTERNAL_SERVER_ERROR: "internal",
  NOT_IMPLEMENTED: "internal",
  BAD_GATEWAY: "internal",
  SERVICE_UNAVAILABLE: "internal",
  GATEWAY_TIMEOUT: "internal",
};

function mapTrpcCode(code: TrpcCode, cause: unknown): ErrorCode {
  // The one code whose meaning depends on its cause, which is why the map
  // alone is not enough — see this function's own note above.
  if (code === "BAD_REQUEST") return cause instanceof ZodError ? "validation" : "internal";
  return DOMAIN_CODE_BY_TRPC_CODE[code];
}

/**
 * A Zod failure, turned into something a form can render.
 *
 * The schema that refused is the one the registry already declares (§11.0), so
 * there is no second description of a valid input anywhere — a hand-written
 * validator beside the schema would be a second source of truth about one
 * shape, and the one nobody is looking at is always the stale one.
 *
 * Without this, tRPC's ZodError was discarded here and every schema failure
 * reached the client as a bare `validation` naming no field at all.
 */
function fieldErrorsOf(cause: unknown): ErrorDetails | undefined {
  if (!(cause instanceof ZodError)) return undefined;
  return {
    fieldErrors: cause.issues.map((issue) => ({
      // Dotted, and indices survive: `lines.2.amount` is a real path here.
      path: issue.path.map(String).join("."),
      message: issue.message,
    })),
  };
}

export const router = t.router;
export const publicProcedure = t.procedure;
