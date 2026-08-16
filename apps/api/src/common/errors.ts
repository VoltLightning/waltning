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

export type ErrorEnvelope = {
  error: {
    code: ErrorCode;
    message: string;
    /** Field-level detail for `validation`; free-form otherwise. */
    details?: unknown;
  };
};

export function envelope(code: ErrorCode, message: string, details?: unknown): ErrorEnvelope {
  return { error: details === undefined ? { code, message } : { code, message, details } };
}

/** Domain refusals. Anything thrown that is not one of these is `internal`. */
export class DomainError extends Error {
  readonly code: ErrorCode;
  readonly details: unknown;

  constructor(code: ErrorCode, message: string, details?: unknown) {
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
