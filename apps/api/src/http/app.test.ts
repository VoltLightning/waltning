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
    // `blobs: async () => undefined` is what an unconfigured stack produces —
    // no MINIO_ENDPOINT, nothing to ask, so nothing claimed.
    const res = await createApp({ now: () => at, blobs: async () => undefined }).request("/readyz");
    const body = await json<Readiness>(res);
    expect("blobs" in body, "blobs must be absent, not asserted").toBe(false);
  });

  it("reports blobs once something does check them", async () => {
    // The field is not gone — it returns the moment there is a measurement to
    // report, and a failing one does not fail readiness (Postgres alone
    // decides `ok`), which is the degradation story `01-context` promises.
    const res = await createApp({ now: () => at, blobs: async () => "down" }).request("/readyz");
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

/**
 * `architecture/12`, against the real app.
 *
 * The rule these pin is that **the cause discriminates, not the code**.
 * `BAD_REQUEST` covers a body whose values failed the schema *and* a body that
 * is not JSON at all — a truncated request from a dropped connection arrives as
 * `BAD_REQUEST` with a `SyntaxError`, never as `PARSE_ERROR`. That was found by
 * running it: the first fix keyed on `PARSE_ERROR` and changed nothing, because
 * nothing reaches that label.
 *
 * These are input-parsing failures, so they resolve before any handler runs and
 * need no database.
 */
describe("validation reaches a field", () => {
  const post = (body: string) =>
    app().request("/trpc/op.create_counterparty", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body,
    });

  it("reports every bad field, not the first one", async () => {
    // The singular `field` this replaced could carry one. You fixed it,
    // resubmitted, and met the second — which is the whole reason a form needs
    // a list.
    const res = await post(JSON.stringify({ name: "", kind: "alien" }));
    const body = await json<ErrorEnvelope>(res);

    expect(body.error.data.code).toBe("validation");
    const paths = body.error.details?.fieldErrors?.map((f) => f.path);
    expect(paths).toContain("name");
    expect(paths).toContain("kind");
  });

  it("is 422, because the body parsed and the values were wrong", async () => {
    const res = await post(JSON.stringify({ name: "" }));
    expect(res.status).toBe(422);
    expect((await json<ErrorEnvelope>(res)).error.data.httpStatus).toBe(422);
  });

  it("dots a nested path so a form can find the input", async () => {
    // `list_transactions.cursor` is an object, so this is not hypothetical:
    // Zod's path is `["cursor","date"]` and a form keyed on `date` alone would
    // put the error on the wrong field, or on none.
    const input = encodeURIComponent(JSON.stringify({ cursor: { date: "nope", id: "nope" } }));
    const res = await app().request(`/trpc/op.list_transactions?input=${input}`);
    const paths = (await json<ErrorEnvelope>(res)).error.details?.fieldErrors?.map((f) => f.path);

    expect(paths).toContain("cursor.date");
    expect(paths).toContain("cursor.id");
  });

  it("carries a message per field, not only a path", async () => {
    const res = await post(JSON.stringify({ name: "" }));
    const first = (await json<ErrorEnvelope>(res)).error.details?.fieldErrors?.[0];
    expect(first?.message).toBeTruthy();
    expect(typeof first?.message).toBe("string");
  });

  /**
   * **The one that loses writes.**
   *
   * A connection drops mid-request and the server receives truncated JSON.
   * Classified as `validation` — documented *never retry unchanged* — the
   * outbox drain concludes the input is permanently wrong and discards a write
   * that never reached an operation. Nothing about the input was wrong; the
   * bytes did not all arrive.
   *
   * Not live yet: the drain does not exist. This is the assertion that makes it
   * safe to build one.
   */
  it("does not call a truncated body a permanent input error", async () => {
    const res = await post('{"name": "trunc');
    const body = await json<ErrorEnvelope>(res);

    expect(body.error.data.code).not.toBe("validation");
    expect(body.error.data.code).toBe("internal");
    // And it names no field, because a body that never parsed has none.
    expect(body.error.details?.fieldErrors).toBeUndefined();
  });

  it("still refuses a well-formed body with bad values, so the split is real", async () => {
    // Guards the guard above: if everything became `internal`, that test would
    // pass while validation had stopped working entirely.
    const res = await post(JSON.stringify({ name: "", kind: "alien" }));
    expect((await json<ErrorEnvelope>(res)).error.data.code).toBe("validation");
  });

  it("leaks no ledger content in the message", async () => {
    // The message carries Zod's issue list. §5.3's posture is that a refusal
    // about a payee must not become a place the payee is echoed.
    const res = await post(JSON.stringify({ name: "Placeholder Ltd", kind: "alien" }));
    expect(await res.text()).not.toContain("Placeholder Ltd");
  });
});
