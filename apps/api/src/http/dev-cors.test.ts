/**
 * The dev CORS allowance, and the three ways it could stop being a dev-only
 * thing.
 *
 * This is the only middleware in the system that makes the API reachable from
 * an origin it does not serve, on a system whose entire perimeter argument is
 * that nothing is public (§5.1). So the tests here are less about CORS working
 * than about it being **off**, **narrow**, and **loud** — the properties that
 * decide whether a development convenience becomes a production hole.
 */

import { REQUEST_ID_HEADER, WALTNING_HEADER } from "@waltning/core/protocol";
import { describe, expect, it } from "vitest";
import { createApp } from "./app.ts";
import { DevCorsConfigError, devCors, parseDevCorsOrigins } from "./dev-cors.ts";

const DEV_ORIGIN = "http://localhost:8081";

describe("parseDevCorsOrigins", () => {
  it("is empty when unset", () => {
    expect(parseDevCorsOrigins(undefined)).toEqual([]);
    expect(parseDevCorsOrigins("")).toEqual([]);
  });

  it("accepts loopback origins, one or several", () => {
    expect(parseDevCorsOrigins(DEV_ORIGIN)).toEqual([DEV_ORIGIN]);
    expect(parseDevCorsOrigins(`${DEV_ORIGIN}, http://127.0.0.1:8081`)).toEqual([
      DEV_ORIGIN,
      "http://127.0.0.1:8081",
    ]);
  });

  it("refuses a wildcard", () => {
    // `*` means every page the operator's browser ever loads can call this API
    // as them. It is the one value that must never be quietly accepted.
    expect(() => parseDevCorsOrigins("*")).toThrow(DevCorsConfigError);
  });

  it("refuses a public origin", () => {
    expect(() => parseDevCorsOrigins("https://example.com")).toThrow(DevCorsConfigError);
  });

  it("refuses a LAN address", () => {
    // The tempting one: "my phone needs to reach it". A native client sends no
    // Origin header and is unaffected by CORS — so this entry would not fix a
    // device, it would only widen what a browser on the network may do.
    expect(() => parseDevCorsOrigins("http://192.168.1.5:8081")).toThrow(DevCorsConfigError);
  });

  it("refuses a wildcard hidden in a list", () => {
    // A list is validated per entry, not by looking at the first one.
    expect(() => parseDevCorsOrigins(`${DEV_ORIGIN},*`)).toThrow(DevCorsConfigError);
  });
});

describe("devCors", () => {
  it("returns nothing to mount when unset", () => {
    // Not a permissive no-op: the caller mounts no middleware at all, so the
    // question "is CORS on" is answered by the route table.
    expect(devCors(undefined)).toBeNull();
    expect(devCors("")).toBeNull();
  });
});

describe("the app", () => {
  it("sends no CORS headers by default", async () => {
    // The production shape. If this ever passes with a header present, the
    // default has flipped and nothing else in the suite would notice.
    const app = createApp({ devCorsOrigin: undefined });
    const res = await app.request("/healthz", { headers: { Origin: DEV_ORIGIN } });
    expect(res.headers.get("access-control-allow-origin")).toBeNull();
  });

  it("allows the configured origin", async () => {
    const app = createApp({ devCorsOrigin: DEV_ORIGIN });
    const res = await app.request("/healthz", { headers: { Origin: DEV_ORIGIN } });
    expect(res.headers.get("access-control-allow-origin")).toBe(DEV_ORIGIN);
  });

  it("does not allow an origin it was not given", async () => {
    const app = createApp({ devCorsOrigin: DEV_ORIGIN });
    const res = await app.request("/healthz", { headers: { Origin: "http://localhost:9999" } });
    expect(res.headers.get("access-control-allow-origin")).toBeNull();
  });

  it("answers the tRPC preflight", async () => {
    // Without this the browser never sends the POST at all, and the failure
    // presents in the client as a network error with no response to inspect.
    const app = createApp({ devCorsOrigin: DEV_ORIGIN });
    const res = await app.request("/trpc/ping", {
      method: "OPTIONS",
      headers: {
        Origin: DEV_ORIGIN,
        "Access-Control-Request-Method": "POST",
        "Access-Control-Request-Headers": `content-type,${REQUEST_ID_HEADER}`,
      },
    });
    expect(res.status).toBeLessThan(300);
    expect(res.headers.get("access-control-allow-origin")).toBe(DEV_ORIGIN);
    const allowed = res.headers.get("access-control-allow-headers") ?? "";
    expect(allowed.toLowerCase()).toContain(REQUEST_ID_HEADER);
  });

  it("exposes the header Rule 0 authenticates on", async () => {
    // The subtle one. A cross-origin fetch cannot *read* a response header
    // unless it is exposed — so without this the client sees no `x-waltning`,
    // rejects every response as captive, and the symptom looks like a server
    // that is down rather than a setting that is missing.
    const app = createApp({ devCorsOrigin: DEV_ORIGIN });
    const res = await app.request("/trpc/ping", { headers: { Origin: DEV_ORIGIN } });
    const exposed = res.headers.get("access-control-expose-headers") ?? "";
    expect(exposed.toLowerCase()).toContain(WALTNING_HEADER);
  });

  it("exposes the request id used to correlate client and API logs", async () => {
    const app = createApp({ devCorsOrigin: DEV_ORIGIN });
    const res = await app.request("/trpc/ping", { headers: { Origin: DEV_ORIGIN } });
    const exposed = res.headers.get("access-control-expose-headers") ?? "";
    expect(exposed.toLowerCase()).toContain(REQUEST_ID_HEADER);
  });
});
