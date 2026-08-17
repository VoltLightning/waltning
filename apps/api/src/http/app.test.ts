/**
 * The probe contract and the error envelope, tested against the real app.
 *
 * These are the two things a client cannot recover from being wrong about:
 * `architecture/09`'s Rule 0 rejects any response that does not authenticate
 * as ours *before* reading its status, and Rule 1 only lets an enveloped error
 * put the client into `blocked`.
 */

import { describe, expect, it } from "vitest";
import type { ErrorEnvelope } from "../common/errors.ts";
import type { Health, Readiness } from "./health.ts";

/**
 * One typed boundary instead of a cast per assertion.
 *
 * A response body is JSON and therefore untyped until someone asserts a shape —
 * but asserting it *here*, once, against the real exported types is what makes
 * these tests catch a contract change. Casting inline to `Record<string,
 * unknown>` reads as caution and is the opposite: it lets the shape drift.
 */
async function json<T>(res: Response): Promise<T> {
  return (await res.json()) as T;
}

import { WALTNING_HEADER } from "@waltning/core";
import { createApp } from "./app.ts";

const at = new Date("2026-08-16T10:00:00.000Z");
const app = () => createApp({ now: () => at, requestId: () => "req-test" });

describe("GET /healthz", () => {
  it("returns ok, build and serverTime", async () => {
    const res = await app().request("/healthz");
    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toEqual({
      ok: true,
      build: "dev",
      serverTime: at.toISOString(),
    });
  });

  it("carries the x-waltning header — Rule 0's first condition", async () => {
    const res = await app().request("/healthz");
    expect(res.headers.get(WALTNING_HEADER)).toBeTruthy();
  });

  /**
   * The distinction the state machine is built on: a database outage must
   * present as `degraded`, not as an unreachable server. `/healthz` answering
   * without any database configured is what keeps those apart.
   */
  it("answers without a database", async () => {
    const saved = process.env["APP_DATABASE_URL"];
    delete process.env["APP_DATABASE_URL"];
    try {
      const res = await app().request("/healthz");
      expect(res.status).toBe(200);
    } finally {
      if (saved !== undefined) process.env["APP_DATABASE_URL"] = saved;
    }
  });
});

describe("GET /readyz", () => {
  it("reports 503 and db down when no database is configured", async () => {
    const saved = process.env["APP_DATABASE_URL"];
    delete process.env["APP_DATABASE_URL"];
    try {
      const res = await app().request("/readyz");
      const body = await json<Readiness>(res);
      expect(res.status).toBe(503);
      expect(body.ok).toBe(false);
      expect(body.db).toBe("down");
      expect(res.headers.get(WALTNING_HEADER)).toBeTruthy();
    } finally {
      if (saved !== undefined) process.env["APP_DATABASE_URL"] = saved;
    }
  });

  /**
   * The probe must not claim what it has not measured.
   *
   * `blobs` used to come from a default that returned `"up"`, and there is no
   * blob-store client in the system — so MinIO could be off, receipt capture
   * broken, and this endpoint would answer `{"ok":true,"blobs":"up"}`. The
   * whole purpose of `/readyz` is per-dependency degradation, and one of its
   * two dependencies was a constant.
   */
  it("omits blobs entirely when nothing checks them", async () => {
    const res = await app().request("/readyz");
    const body = await json<Readiness>(res);
    expect("blobs" in body, "blobs must be absent, not asserted").toBe(false);
  });

  it("reports blobs once something does check them", async () => {
    // The field is not gone — it returns the moment there is a measurement to
    // report, and a failing one does not fail readiness (Postgres alone
    // decides `ok`), which is the degradation story `01-context` promises.
    const res = await createApp({ now: () => at, blobs: () => "down" }).request("/readyz");
    const body = await json<Readiness>(res);
    expect(body.blobs).toBe("down");
  });

  it("never leaks a connection string in the reason", async () => {
    const saved = process.env["APP_DATABASE_URL"];
    process.env["APP_DATABASE_URL"] = "postgresql://user:hunter2@127.0.0.1:5442/x";
    try {
      const res = await app().request("/readyz");
      expect(await res.text()).not.toContain("hunter2");
    } finally {
      if (saved === undefined) delete process.env["APP_DATABASE_URL"];
      else process.env["APP_DATABASE_URL"] = saved;
    }
  });
});

describe("tRPC", () => {
  it("answers ping in the tRPC envelope — Rule 0's second condition", async () => {
    const res = await app().request("/trpc/ping");
    expect(res.status).toBe(200);
    const body = await json<{ result: { data: Health & { requestId: string } } }>(res);
    expect(body.result.data.ok).toBe(true);
    expect(body.result.data.build).toBe("dev");
    expect(res.headers.get(WALTNING_HEADER)).toBeTruthy();
  });

  /**
   * A stack trace rode along in `shape.data` outside production, and the
   * httpStatus beside it came from tRPC's code rather than ours — so a
   * duplicate name returned `validation` in the envelope and `500` with a
   * stack next to it. Both are pinned here.
   */
  it("never returns a stack trace, and its httpStatus agrees with the envelope", async () => {
    const res = await app().request("/trpc/nope");
    const text = await res.text();
    expect(text).not.toMatch(/\bstack\b/i);
    expect(text).not.toContain("at Object.");
    const body = JSON.parse(text) as ErrorEnvelope;
    expect(body.error.data.code).toBe("not_found");
    expect(body.error.data.httpStatus).toBe(404);
  });

  it("shapes an unknown procedure as an enveloped domain error", async () => {
    const res = await app().request("/trpc/nope");
    const body = await json<ErrorEnvelope>(res);
    expect(body.error).toBeDefined();
    expect(body.error.data.code).toBe("not_found");
    expect(typeof body.error.message).toBe("string");
  });

  /**
   * **The one that was missed, and the reason `pnpm e2e` exists.**
   *
   * The domain code used to sit at `error.code`, replacing tRPC's numeric one.
   * That reads better, matched Rule 1's wording literally, and made every error
   * in the system unusable: tRPC's client rejects an error response whose
   * `error.code` is not a number, discards the body, and throws "Unable to
   * transform response from server" — no code, no details, no path.
   *
   * Every assertion above still passed. The body was well-formed and the
   * status was right; the failure existed only in a client that parses it. So
   * this asserts the *type*, which is the part no reader would think to check.
   */
  it("keeps a numeric code at the top level, or no client can read the error", async () => {
    const res = await app().request("/trpc/nope");
    const body = await json<ErrorEnvelope>(res);
    expect(typeof body.error.code).toBe("number");
  });
});
