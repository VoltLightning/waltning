/**
 * The probe contract and the error envelope, tested against the real app.
 *
 * These are the two things a client cannot recover from being wrong about:
 * `architecture/09`'s Rule 0 rejects any response that does not authenticate
 * as ours *before* reading its status, and Rule 1 only lets an enveloped error
 * put the client into `blocked`.
 */

import { describe, expect, it } from "vitest";
import { createApp } from "./app.ts";
import { WALTNING_HEADER } from "./build.ts";

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
    process.env["APP_DATABASE_URL"] = undefined as unknown as string;
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
      const body = (await res.json()) as Record<string, unknown>;
      expect(res.status).toBe(503);
      expect(body["ok"]).toBe(false);
      expect(body["db"]).toBe("down");
      expect(res.headers.get(WALTNING_HEADER)).toBeTruthy();
    } finally {
      if (saved !== undefined) process.env["APP_DATABASE_URL"] = saved;
    }
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
    const body = (await res.json()) as { result?: { data?: Record<string, unknown> } };
    expect(body.result?.data?.["ok"]).toBe(true);
    expect(body.result?.data?.["build"]).toBe("dev");
    expect(res.headers.get(WALTNING_HEADER)).toBeTruthy();
  });

  /**
   * Rule 1: a domain refusal must arrive as `{error:{code,…}}` with *our*
   * vocabulary. If this ever returns tRPC's numeric code, the drain cannot
   * tell a permanent refusal from a proxy's 403.
   */
  it("shapes an unknown procedure as an enveloped domain error", async () => {
    const res = await app().request("/trpc/nope");
    const body = (await res.json()) as { error?: { code?: unknown; message?: unknown } };
    expect(body.error).toBeDefined();
    expect(body.error?.code).toBe("not_found");
    expect(typeof body.error?.message).toBe("string");
  });
});
