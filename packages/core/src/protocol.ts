/**
 * Rule 0 — a 200 is not a success (`architecture/09`).
 *
 * A captive portal answers `200` with HTML to every POST. A drain that
 * classifies on status class alone reads that 200, marks the entries sent, and
 * deletes them. Nothing reached the Pi, the captures are gone, and it arrives
 * disguised as a successful sync — on hotel wifi, which is exactly where a week
 * of travel captures would be.
 *
 * So this lives in `core` rather than in the client, for two reasons:
 *
 *  - **The header string is a contract between two codebases.** The server
 *    stamps it in middleware and the client rejects anything without it. Two
 *    copies of `"x-waltning"` is one rename away from a client that trusts
 *    every response, and nothing would fail — the rename would look complete.
 *  - **There will be a second caller.** The query client checks responses now;
 *    the outbox drain checks them later, and it is the drain where getting this
 *    wrong destroys data. One implementation, or the important one is the copy
 *    that drifted.
 *
 * Pure: no fetch, no React, no platform API. It takes what a response already
 * carries and answers one question.
 */

/**
 * Stamped on every response including errors, and the cheapest of Rule 0's
 * three signals to check.
 */
export const WALTNING_HEADER = "x-waltning";

/** Sent by the client on every request once a session exists (§5.2). */
export const NONCE_HEADER = "x-waltning-nonce";

/** Correlates one client request, HTTP edge log and registry invocation. */
export const REQUEST_ID_HEADER = "x-request-id";

export type ResponseAuthentication =
  | { ours: true; build: string }
  | { ours: false; reason: AuthenticationFailure };

/**
 * Why a response is not ours. Each maps to `link = captive`, and the queue does
 * not advance — but they are distinguished because they mean different things
 * to a human reading a log: a missing header is a proxy in the path, a body
 * that will not parse is usually a portal's sign-in page, and a nonce mismatch
 * is a response from a *different* session, which is the one that suggests
 * something worse than bad wifi.
 */
export type AuthenticationFailure = "no-header" | "not-an-envelope" | "nonce-mismatch";

/**
 * Rule 0's three checks, in one place.
 *
 * `expectedNonce` is `null` until §5.2 exists, and that is passed **by the
 * caller** rather than defaulted here. The difference matters: a default would
 * make "we have no session yet" and "we forgot to check" the same line of code,
 * and the second one is a security hole that reads as finished work. The check
 * itself is implemented and tested — it is waiting for a value, not for code.
 *
 * @param headerValue  the `x-waltning` response header, or null if absent
 * @param bodyText     the raw body, **not** parsed by the caller first
 * @param expectedNonce the nonce issued at login, or null if there is no session
 */
export function authenticateResponse(
  headerValue: string | null,
  bodyText: string,
  expectedNonce: string | null,
  receivedNonce: string | null = null,
): ResponseAuthentication {
  // First, because it costs nothing and rejects the common case: a portal
  // returning its own page has no idea this header exists.
  if (!headerValue) return { ours: false, reason: "no-header" };

  if (!isTrpcEnvelope(bodyText)) return { ours: false, reason: "not-an-envelope" };

  // Only meaningful once a session exists. When it does, a response carrying
  // the wrong nonce is rejected even though the first two checks passed.
  if (expectedNonce !== null && receivedNonce !== expectedNonce) {
    return { ours: false, reason: "nonce-mismatch" };
  }

  return { ours: true, build: headerValue };
}

/**
 * Whether a body is shaped like tRPC's envelope.
 *
 * Deliberately structural rather than a schema: the point is to tell our
 * transport from someone else's, not to validate the payload — that is the
 * procedure's own output type. HTML fails at `JSON.parse`; a JSON body from
 * some other service fails on the `result`/`error` key.
 *
 * An array is accepted because a batched call returns one entry per procedure.
 * An **empty** array is not: it parses, it is technically an array of
 * envelopes, and it answers no call that was made.
 */
export function isTrpcEnvelope(bodyText: string): boolean {
  let parsed: unknown;
  try {
    parsed = JSON.parse(bodyText);
  } catch {
    return false;
  }

  if (Array.isArray(parsed)) {
    return parsed.length > 0 && parsed.every(isEnvelopeObject);
  }
  return isEnvelopeObject(parsed);
}

function isEnvelopeObject(value: unknown): boolean {
  if (typeof value !== "object" || value === null) return false;
  // `in` rather than a truthiness test: `{"result":{"data":null}}` is a
  // perfectly good answer from a procedure that returns nothing, and a
  // truthiness test would classify our own valid response as a portal's.
  return "result" in value || "error" in value;
}
