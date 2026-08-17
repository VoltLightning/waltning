/**
 * The error envelope.
 *
 * `architecture/09` Rule 1: **only errors carrying this envelope may set
 * `blocked`.** A bare 403 from Caddy or a 404 from a proxy is a transport
 * event, not a domain refusal — the client must be able to tell those apart,
 * and the only way it can is if domain refusals look like this and nothing
 * else does.
 *
 * The codes are the ones the outbox drain switches on. Adding one is a
 * contract change: the drain has to learn what to do with it.
 */

export const ERROR_CODES = [
  /** A write into a closed tax period (§6.5's guard trigger). Never retry. */
  "period_closed",
  /** Input failed its Zod schema. Never retry unchanged. */
  "validation",
  /** The row moved since the client read it. Re-read, then decide. */
  "stale_version",
  /** The client's `opVersion` is older than the server accepts. Update first. */
  "unsupported_version",
  /** Authenticated, but not permitted. */
  "forbidden",
  /** Nothing matched. */
  "not_found",
  /** Everything else. Retryable only if the client knows the write is idempotent. */
  "internal",
] as const;

export type ErrorCode = (typeof ERROR_CODES)[number];

/**
 * Field-level detail. Typed rather than free-form: the client renders these,
 * and `unknown` here meant every consumer cast before it could show anything.
 */
export type ErrorDetails = {
  /** The input field at fault, for `validation`. */
  field?: string;
  /** The database constraint that refused it, when one did. */
  constraint?: string;
  /** The period that is closed, for `period_closed`. */
  period?: string;
  /** Versions involved, for `stale_version` and `unsupported_version`. */
  expected?: string | number;
  actual?: string | number;
};

/**
 * The envelope **as it appears on the wire**, which is not where the domain
 * code first lived.
 *
 * `error.code` is tRPC's numeric JSON-RPC code and has to stay that way: its
 * client validates the type and discards the entire error response otherwise.
 * The domain code — the one Rule 1 and the outbox drain switch on — is at
 * `error.data.code`.
 *
 * This type previously declared `error.code: ErrorCode`, describing a response
 * the server does not send, and there was a constructor beside it building
 * that shape for nobody: nothing in the system called it, and anything that
 * had would have produced an envelope no client could read. Deleted rather
 * than corrected, because a second way to build an envelope is a second shape
 * to keep in step, and the formatter in `trpc/index.ts` is the only one that
 * reaches a client.
 */
export type ErrorEnvelope<Details extends ErrorDetails = ErrorDetails> = {
  error: {
    /** tRPC's numeric code. Not the domain vocabulary — see `data.code`. */
    code: number;
    message: string;
    data: {
      code: ErrorCode;
      httpStatus: number;
      path?: string;
    };
    details?: Details;
  };
};

/** Domain refusals. Anything thrown that is not one of these is `internal`. */
export class DomainError<Details extends ErrorDetails = ErrorDetails> extends Error {
  readonly code: ErrorCode;
  readonly details: Details | undefined;

  constructor(code: ErrorCode, message: string, details?: Details) {
    super(message);
    this.name = "DomainError";
    this.code = code;
    this.details = details;
  }
}

/**
 * HTTP status per code. The client must not need these — Rule 0 says the
 * envelope decides, not the status — but a proxy log is easier to read when
 * they are conventional.
 */
export const STATUS_BY_CODE: Record<ErrorCode, number> = {
  period_closed: 409,
  validation: 400,
  stale_version: 409,
  unsupported_version: 426,
  forbidden: 403,
  not_found: 404,
  internal: 500,
};
