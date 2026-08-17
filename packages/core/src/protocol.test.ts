/**
 * Rule 0, tested against the responses that actually cause the bug.
 *
 * `architecture/09` calls the absence of this rule a data-loss bug, so the
 * cases below are not hypotheses: a captive portal's sign-in page, a proxy's
 * own JSON error, a 200 with an empty body. Each of those is a response a
 * status-class check calls a success.
 */

import { describe, expect, it } from "vitest";
import { authenticateResponse, isTrpcEnvelope, WALTNING_HEADER } from "./protocol.ts";

const OK_BODY = '{"result":{"data":{"ok":true}}}';

/** The shape a hotel wifi sign-in page arrives in: 200, HTML, no header. */
const PORTAL_PAGE = "<!DOCTYPE html><html><body>Sign in to continue</body></html>";

describe("authenticateResponse", () => {
  it("accepts our own response and reports the build", () => {
    expect(authenticateResponse("abc123", OK_BODY, null)).toEqual({ ours: true, build: "abc123" });
  });

  it("rejects a captive portal's page", () => {
    // Both signals fail here; the header is checked first because it is free.
    expect(authenticateResponse(null, PORTAL_PAGE, null)).toEqual({
      ours: false,
      reason: "no-header",
    });
  });

  it("rejects a valid envelope with no header", () => {
    // A proxy that strips response headers, or a cache serving a body from
    // somewhere else. The body alone is not enough.
    expect(authenticateResponse(null, OK_BODY, null)).toEqual({
      ours: false,
      reason: "no-header",
    });
  });

  it("rejects HTML that somehow carries the header", () => {
    expect(authenticateResponse("dev", PORTAL_PAGE, null)).toEqual({
      ours: false,
      reason: "not-an-envelope",
    });
  });

  it("accepts an error envelope — a refusal is still our answer", () => {
    // This is the one that matters for the drain: a domain error must reach
    // `blocked`, and it cannot if Rule 0 has already classified it as captive.
    const body = '{"error":{"code":"validation","message":"name is required"}}';
    expect(authenticateResponse("dev", body, null)).toEqual({ ours: true, build: "dev" });
  });

  it("accepts a procedure that returns nothing", () => {
    // `{"result":{"data":null}}`. A truthiness test on `result.data` would
    // call our own valid response a portal's.
    expect(authenticateResponse("dev", '{"result":{"data":null}}', null)).toEqual({
      ours: true,
      build: "dev",
    });
  });

  describe("the session nonce", () => {
    // Implemented and exercised, but not yet fed a value: §5.2 has no session.
    // The caller passes `null` explicitly, so "no session yet" never looks the
    // same in the source as "nobody checked".

    it("passes when the nonce matches", () => {
      expect(authenticateResponse("dev", OK_BODY, "n-1", "n-1")).toEqual({
        ours: true,
        build: "dev",
      });
    });

    it("rejects a response from a different session", () => {
      expect(authenticateResponse("dev", OK_BODY, "n-1", "n-2")).toEqual({
        ours: false,
        reason: "nonce-mismatch",
      });
    });

    it("rejects a missing nonce once a session exists", () => {
      expect(authenticateResponse("dev", OK_BODY, "n-1", null)).toEqual({
        ours: false,
        reason: "nonce-mismatch",
      });
    });

    it("ignores the nonce entirely when there is no session", () => {
      expect(authenticateResponse("dev", OK_BODY, null, "anything")).toEqual({
        ours: true,
        build: "dev",
      });
    });
  });
});

describe("isTrpcEnvelope", () => {
  it("accepts a single envelope and a batch", () => {
    expect(isTrpcEnvelope(OK_BODY)).toBe(true);
    expect(isTrpcEnvelope('[{"result":{"data":1}},{"result":{"data":2}}]')).toBe(true);
  });

  it("rejects an empty batch", () => {
    // Parses, and is vacuously "an array of envelopes" — while answering none
    // of the calls that were made. `every` on an empty array is true, which is
    // how this one gets through.
    expect(isTrpcEnvelope("[]")).toBe(false);
  });

  it("rejects a batch with one foreign entry", () => {
    expect(isTrpcEnvelope('[{"result":{"data":1}},{"status":"blocked"}]')).toBe(false);
  });

  it("rejects JSON that is not an envelope", () => {
    // A proxy or gateway answering in its own vocabulary — valid JSON, 200,
    // and nothing to do with us.
    expect(isTrpcEnvelope('{"status":"ok"}')).toBe(false);
    expect(isTrpcEnvelope('{"message":"forbidden"}')).toBe(false);
  });

  it("rejects the probe bodies", () => {
    // `/healthz` answers `{"ok":true,…}`, which is deliberately *not* an
    // envelope: it is not a tRPC call. The tRPC-shaped twin is the `ping`
    // procedure, and that one is an envelope.
    expect(
      isTrpcEnvelope('{"ok":true,"build":"dev","serverTime":"2026-08-17T00:00:00.000Z"}'),
    ).toBe(false);
  });

  it("rejects non-objects and unparseable bodies", () => {
    expect(isTrpcEnvelope("")).toBe(false);
    expect(isTrpcEnvelope("null")).toBe(false);
    expect(isTrpcEnvelope('"result"')).toBe(false);
    expect(isTrpcEnvelope("200")).toBe(false);
    expect(isTrpcEnvelope(PORTAL_PAGE)).toBe(false);
  });
});

describe("the header name", () => {
  it("is the one the server stamps", () => {
    // Lowercase, because `Headers.get` is case-insensitive but a string
    // comparison anywhere else would not be.
    expect(WALTNING_HEADER).toBe("x-waltning");
  });
});
