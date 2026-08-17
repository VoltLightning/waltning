/**
 * The fetch wrapper, tested on the two things it can break.
 *
 * One is Rule 0 itself — a portal's 200 must not reach tRPC. The other is
 * quieter and is the reason this file is longer than it looks like it should
 * be: to authenticate a body you must *read* it, a `Response` body is a stream
 * that reads once, and everything downstream then sees an empty payload. That
 * failure has nothing to do with connectivity, appears only against a real
 * server, and looks like the server returning nothing.
 */

import { describe, expect, it, vi } from "vitest";
import { CaptiveResponseError, type FetchInit, ruleZeroFetch } from "./rule-zero-fetch.ts";

const OK_BODY = '{"result":{"data":{"ok":true}}}';

/** A response the way the server sends it: header stamped, envelope body. */
function ours(body = OK_BODY, status = 200): Response {
  return new Response(body, {
    status,
    headers: { "x-waltning": "dev", "content-type": "application/json" },
  });
}

/** What a hotel wifi sign-in page looks like on the wire. */
function portal(): Response {
  return new Response("<html><body>Sign in</body></html>", {
    status: 200,
    headers: { "content-type": "text/html" },
  });
}

function fetchReturning(response: Response) {
  return vi.fn(async () => response);
}

describe("a response that is ours", () => {
  it("comes back readable", async () => {
    // The stream-consumed bug: authenticating the body reads it, so the
    // response handed on must carry a fresh one. Without the re-wrap this
    // resolves to "" and every call looks like it returned nothing.
    const f = ruleZeroFetch({ inner: fetchReturning(ours()) });
    const res = await f("http://localhost:3000/trpc/ping");
    await expect(res.text()).resolves.toBe(OK_BODY);
  });

  it("keeps its status and headers", async () => {
    const f = ruleZeroFetch({ inner: fetchReturning(ours(OK_BODY, 201)) });
    const res = await f("http://localhost:3000/trpc/x");
    expect(res.status).toBe(201);
    expect(res.headers.get("content-type")).toBe("application/json");
  });

  it("passes a domain error through untouched", async () => {
    // A 400 carrying our envelope is a *decision*, and it must reach the
    // client. Rejecting it here would turn every refusal into a transport
    // problem, which the drain then retries forever.
    const body = '{"error":{"code":"validation","message":"name is required"}}';
    const f = ruleZeroFetch({ inner: fetchReturning(ours(body, 400)) });
    const res = await f("http://localhost:3000/trpc/op.create_counterparty");
    expect(res.status).toBe(400);
    await expect(res.text()).resolves.toBe(body);
  });
});

describe("a response that is not ours", () => {
  it("throws rather than returning a 200", async () => {
    const f = ruleZeroFetch({ inner: fetchReturning(portal()) });
    await expect(f("http://localhost:3000/trpc/ping")).rejects.toBeInstanceOf(CaptiveResponseError);
  });

  it("says why, and does not present the status as meaningful", async () => {
    const f = ruleZeroFetch({ inner: fetchReturning(portal()) });
    const error = await f("http://localhost:3000/trpc/ping").catch((e: unknown) => e);
    expect(error).toBeInstanceOf(CaptiveResponseError);
    const captive = error as CaptiveResponseError;
    expect(captive.reason).toBe("no-header");
    expect(captive.status).toBe(200);
  });

  it("notifies the observer", async () => {
    const onCaptive = vi.fn();
    const f = ruleZeroFetch({ inner: fetchReturning(portal()), onCaptive });
    await f("http://localhost:3000/trpc/ping").catch(() => undefined);
    expect(onCaptive).toHaveBeenCalledOnce();
  });

  it("rejects our header on someone else's body", async () => {
    const withHeader = new Response("<html>hi</html>", { headers: { "x-waltning": "dev" } });
    const f = ruleZeroFetch({ inner: fetchReturning(withHeader) });
    const error = await f("http://localhost:3000/trpc/ping").catch((e: unknown) => e);
    expect((error as CaptiveResponseError).reason).toBe("not-an-envelope");
  });
});

describe("the outgoing request", () => {
  /**
   * Captures what the wrapper handed to the platform fetch — and **echoes the
   * nonce back**, which is a statement about the server, not a test detail.
   *
   * Rule 0's third signal only authenticates a response if the response
   * carries it: a portal cannot know a nonce, and that is the whole value of
   * the check. So when §5.2 issues nonces, the API must echo the request's
   * `x-waltning-nonce` on every response — including errors, exactly like
   * `x-waltning`. Without that middleware the client would send a nonce, get
   * nothing back, and classify every single response as captive.
   */
  function capturing() {
    const seen: { input: unknown; init: RequestInit | undefined }[] = [];
    const inner = vi.fn(async (input: unknown, init?: RequestInit) => {
      seen.push({ input, init });
      const nonce = new Headers(init?.headers).get("x-waltning-nonce");
      const response = ours();
      if (nonce !== null) response.headers.set("x-waltning-nonce", nonce);
      return response;
    });
    return { seen, inner: inner as unknown as typeof fetch };
  }

  it("carries no nonce header when there is no session", async () => {
    const { seen, inner } = capturing();
    await ruleZeroFetch({ inner })("http://localhost:3000/trpc/ping");
    expect(new Headers(seen[0]?.init?.headers).get("x-waltning-nonce")).toBeNull();
  });

  it("carries the nonce once there is one", async () => {
    const { seen, inner } = capturing();
    await ruleZeroFetch({ inner, nonce: () => "n-7" })("http://localhost:3000/trpc/ping");
    expect(new Headers(seen[0]?.init?.headers).get("x-waltning-nonce")).toBe("n-7");
  });

  it("reads the nonce per request, not once at construction", async () => {
    // A login must not require rebuilding the client. If this ever captures,
    // the first request after signing in is the one that fails.
    const { seen, inner } = capturing();
    let current: string | null = null;
    const f = ruleZeroFetch({ inner, nonce: () => current });
    await f("http://localhost:3000/trpc/ping");
    current = "n-8";
    await f("http://localhost:3000/trpc/ping");
    expect(new Headers(seen[0]?.init?.headers).get("x-waltning-nonce")).toBeNull();
    expect(new Headers(seen[1]?.init?.headers).get("x-waltning-nonce")).toBe("n-8");
  });

  it("preserves method, body, headers and signal", async () => {
    // `outgoing()` rebuilds the init property by property rather than
    // spreading it, so a field that is added and not carried over disappears
    // with no error anywhere. This is the check that notices.
    const { seen, inner } = capturing();
    const controller = new AbortController();
    const init: FetchInit = {
      method: "POST",
      body: '{"x":1}',
      headers: { "content-type": "application/json" },
      signal: controller.signal,
    };
    await ruleZeroFetch({ inner })("http://localhost:3000/trpc/op.x", init);

    const sent = seen[0]?.init;
    expect(sent?.method).toBe("POST");
    expect(sent?.body).toBe('{"x":1}');
    expect(sent?.signal).toBe(controller.signal);
    expect(new Headers(sent?.headers).get("content-type")).toBe("application/json");
  });

  it("omits an absent signal rather than sending undefined", async () => {
    // `{signal: undefined}` is a different thing from no signal under
    // `exactOptionalPropertyTypes`, and only one of them is a valid RequestInit.
    const { seen, inner } = capturing();
    await ruleZeroFetch({ inner })("http://localhost:3000/trpc/ping", { method: "GET" });
    expect(seen[0]?.init && "signal" in seen[0].init).toBe(false);
  });
});
