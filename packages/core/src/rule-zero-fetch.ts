/**
 * Rule 0, at the only place that can enforce it: below tRPC, above the network.
 *
 * tRPC's links see a parsed response. By then the decision is already made —
 * either it parsed, in which case a portal's HTML has already thrown a generic
 * parse error indistinguishable from a corrupt payload, or it did not and the
 * status has already been consulted. The check has to happen on the raw
 * response, which means the `fetch` implementation itself.
 *
 * **What this does not do is retry, back off, or classify transport failures.**
 * That is the link state machine in `architecture/09`, and it belongs to the
 * outbox drain, not to a query. This answers one question — is this response
 * ours — and hands the answer up.
 *
 * It sits in `core` rather than in the app because there are two clients: the
 * one in `apps/mobile`, and the one `pnpm e2e` uses to check a running stack.
 * A second copy of this would be a second Rule 0, and the copy that drifts is
 * always the one nobody is looking at. `fetch`, `Response` and `Headers` are
 * standard on all three surfaces, so the dependency floor is unchanged — no
 * Node API, no new package.
 */

import {
  type AuthenticationFailure,
  authenticateResponse,
  NONCE_HEADER,
  WALTNING_HEADER,
} from "./protocol.ts";

/**
 * Thrown when a response fails Rule 0.
 *
 * A distinct class, not a generic `Error`, because the caller has to be able to
 * tell "the server refused" from "that was not the server". They look identical
 * in a `catch` and mean opposite things: one is a decision to show the user,
 * the other means nothing was decided at all and the request must be considered
 * un-sent.
 */
export class CaptiveResponseError extends Error {
  readonly reason: AuthenticationFailure;
  /** What the response claimed to be, for the log. Never shown to a user. */
  readonly status: number;

  constructor(reason: AuthenticationFailure, status: number) {
    super(`response failed Rule 0 (${reason}); status ${status} was not consulted`);
    this.name = "CaptiveResponseError";
    this.reason = reason;
    this.status = status;
  }
}

/**
 * What tRPC actually sends, and what the platform `fetch` actually accepts —
 * which are not the same type.
 *
 * tRPC types its `fetch` option as accepting `RequestInit | RequestInitEsque`,
 * its own looser shape for runtimes with their own fetch. Under
 * `exactOptionalPropertyTypes` those two are mutually unassignable over one
 * property: `signal`, which the DOM types as `AbortSignal | null` and tRPC as
 * possibly-`undefined`.
 *
 * tRPC resolves this in its own source with `window.fetch as FetchEsque`. A
 * cast here would compile and would also silence any *real* mismatch this seam
 * develops later — so instead the overlap is declared, and the one property
 * that differs is handled explicitly below.
 */
export type FetchInit = {
  // Every property carries an explicit `| undefined`. Under
  // `exactOptionalPropertyTypes` an optional property and one that may be
  // *present and undefined* are different types, and tRPC passes the latter.
  //
  // The value types are taken from the platform's own `RequestInit` rather
  // than named directly: `BodyInit` and `HeadersInit` are DOM-library names,
  // and `core` deliberately does not load the DOM library — it must compile
  // the same on the server, where `document` should not be reachable.
  method?: string | undefined;
  body?: RequestInit["body"] | undefined;
  headers?: RequestInit["headers"] | undefined;
  signal?: AbortSignal | null | undefined;
};

export type FetchLike = (input: Parameters<typeof fetch>[0], init?: FetchInit) => Promise<Response>;

export type RuleZeroOptions = {
  /**
   * The nonce this client was issued at login, or `null` while §5.2 does not
   * exist. Read per request rather than captured, so signing in does not
   * require a new client.
   *
   * **It is never sent.** The first version of this put it in a request header
   * for the server to echo, which authenticates nothing: anything able to
   * answer the request was able to read it, so a captive portal could echo it
   * back exactly as well as the API could. Worse, it turned a shared secret
   * into a bearer token transmitted on every single call.
   *
   * The nonce is established *at login* and held by both ends. The server
   * stamps it on responses; this compares. A portal never saw the login, so it
   * cannot produce the value — which is the only reason the check is worth
   * anything.
   */
  nonce?: () => string | null;
  /** Observability hook — the link indicator subscribes here later. */
  onCaptive?: (error: CaptiveResponseError) => void;
  /** Injected in tests; the platform `fetch` otherwise. */
  inner?: typeof fetch;
};

/**
 * Wraps a `fetch` so every response is authenticated before anyone reads it.
 */
export function ruleZeroFetch(options: RuleZeroOptions = {}): FetchLike {
  const inner = options.inner ?? globalThis.fetch;
  const nonceOf = options.nonce ?? (() => null);

  return async (input, init) => {
    const nonce = nonceOf();

    const response = await inner(input, outgoing(init));

    // Read once. A `Response` body is a stream and can only be consumed once,
    // so the text is re-wrapped below rather than the response being passed on
    // — tRPC would otherwise receive a body that has already been drained,
    // which presents as an empty payload rather than as this bug.
    const bodyText = await response.text();

    const verdict = authenticateResponse(
      response.headers.get(WALTNING_HEADER),
      bodyText,
      nonce,
      response.headers.get(NONCE_HEADER),
    );

    if (!verdict.ours) {
      const error = new CaptiveResponseError(verdict.reason, response.status);
      options.onCaptive?.(error);
      throw error;
    }

    return new Response(bodyText, {
      status: response.status,
      statusText: response.statusText,
      headers: response.headers,
    });
  };
}

/**
 * The request as the platform `fetch` wants it: every optional property either
 * present with a value or **absent**, never present holding `undefined`.
 *
 * That is why this is three named properties rather than `{...init}`. Under
 * `exactOptionalPropertyTypes` those two states are different types, and a
 * spread carries the second one through — so the properties are rebuilt one at
 * a time. Adding a field to `FetchInit` and forgetting it here drops it
 * silently, which is what the tests below are for.
 *
 * Nothing is added here. The nonce is deliberately not sent — see
 * `RuleZeroOptions.nonce`.
 */
function outgoing(init: FetchInit | undefined): RequestInit {
  const headers = new Headers(init?.headers);

  return {
    headers,
    ...(init?.method === undefined ? {} : { method: init.method }),
    ...(init?.body === undefined ? {} : { body: init.body }),
    ...(init?.signal === undefined ? {} : { signal: init.signal }),
  };
}
