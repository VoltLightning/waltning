/**
 * The blob probe, and the distinction it exists to preserve.
 *
 * Three answers, not two: **up**, **down**, and **not measured**. The third is
 * the one that matters — this field was previously a constant `"up"` for a
 * dependency nothing had ever contacted, and the repair was to omit it. It only
 * comes back on the condition that it is real, which means an unconfigured
 * stack must still say nothing rather than guess.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { blobsEndpoint, pingBlobs } from "./blobs.ts";

const ENDPOINT = "http://minio.test:9000";

let saved: string | undefined;

beforeEach(() => {
  saved = process.env["MINIO_ENDPOINT"];
});

afterEach(() => {
  if (saved === undefined) delete process.env["MINIO_ENDPOINT"];
  else process.env["MINIO_ENDPOINT"] = saved;
  vi.unstubAllGlobals();
});

describe("when nothing is configured", () => {
  it("measures nothing and says so", async () => {
    delete process.env["MINIO_ENDPOINT"];
    expect(blobsEndpoint()).toBeNull();
    // `undefined`, never `"down"`. A development stack without MinIO is not
    // degraded — it has no blob store, which is a different fact and must not
    // render as a failing dependency.
    await expect(pingBlobs()).resolves.toBeUndefined();
  });

  it("does not reach the network to find that out", async () => {
    delete process.env["MINIO_ENDPOINT"];
    const fetchSpy = vi.fn();
    vi.stubGlobal("fetch", fetchSpy);
    await pingBlobs();
    expect(fetchSpy).not.toHaveBeenCalled();
  });
});

describe("when a blob store is configured", () => {
  beforeEach(() => {
    process.env["MINIO_ENDPOINT"] = ENDPOINT;
  });

  it("reports up on a healthy liveness response", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response(null, { status: 200 })),
    );
    await expect(pingBlobs()).resolves.toBe("up");
  });

  it("asks the unauthenticated liveness endpoint", async () => {
    // Deliberately the endpoint that needs no credentials: a probe that had to
    // authenticate would report "down" for a wrong password, and a wrong
    // password is not an outage.
    // Typed through the parameter rather than indexed off `mock.calls`, whose
    // element type is `[]` for a zero-argument mock — the call is recorded, the
    // type says there is nothing at index 0.
    const seen: string[] = [];
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: URL | string) => {
        seen.push(String(url));
        return new Response(null, { status: 200 });
      }),
    );
    await pingBlobs();
    expect(seen[0]).toBe(`${ENDPOINT}/minio/health/live`);
  });

  it("reports down on a bad status", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response(null, { status: 503 })),
    );
    await expect(pingBlobs()).resolves.toBe("down");
  });

  it("reports down when the connection fails", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => {
        throw new TypeError("fetch failed");
      }),
    );
    await expect(pingBlobs()).resolves.toBe("down");
  });

  it("gives up rather than hanging", async () => {
    // A blob store that accepts the connection and never answers would
    // otherwise turn `/readyz` into another hung request, and the caller would
    // conclude the *API* is down.
    vi.stubGlobal(
      "fetch",
      vi.fn(async (_url: unknown, init?: { signal?: AbortSignal }) => {
        expect(init?.signal, "the probe must carry a timeout").toBeInstanceOf(AbortSignal);
        throw new DOMException("The operation was aborted.", "TimeoutError");
      }),
    );
    await expect(pingBlobs()).resolves.toBe("down");
  });
});
