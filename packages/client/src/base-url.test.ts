/**
 * Where the API is, per surface — and the one case that must refuse to guess.
 */

import { describe, expect, it } from "vitest";
import { ApiBaseUrlError, resolveApiBaseUrl } from "./base-url.ts";

describe("web", () => {
  it("is same-origin in production", () => {
    // `""` is the answer, not a missing one: Caddy owns both the bundle and
    // `/trpc`, so every request should be relative.
    expect(resolveApiBaseUrl({ configured: undefined, surface: "web", dev: false })).toBe("");
  });

  it("points at the API process in dev", () => {
    // Metro serves the bundle on :8081; the API is a separate process on :3000.
    expect(resolveApiBaseUrl({ configured: undefined, surface: "web", dev: true })).toBe(
      "http://localhost:3000",
    );
  });
});

describe("native", () => {
  it("uses loopback in dev, which is the Mac from a simulator", () => {
    expect(resolveApiBaseUrl({ configured: undefined, surface: "native", dev: true })).toBe(
      "http://127.0.0.1:3000",
    );
  });

  it("refuses to guess for a real build", () => {
    // The important one. A device build falling back to loopback would look
    // for the API *on the phone*, find nothing every time, and present as a
    // server that is down — on the surface where that story is most credible.
    expect(() =>
      resolveApiBaseUrl({ configured: undefined, surface: "native", dev: false }),
    ).toThrow(ApiBaseUrlError);
  });
});

describe("an explicit setting", () => {
  it("wins on every surface, including in dev", () => {
    // How a real device reaches a tailnet host, and how anyone points the app
    // at a second machine.
    const tailnet = "https://waltning.example.ts.net";
    for (const surface of ["web", "native"] as const) {
      for (const dev of [true, false]) {
        expect(resolveApiBaseUrl({ configured: tailnet, surface, dev })).toBe(tailnet);
      }
    }
  });

  it("drops a trailing slash", () => {
    // `${base}/trpc` on a value ending in `/` produces `//trpc`, which some
    // proxies redirect and others 404 — neither with a useful message.
    expect(
      resolveApiBaseUrl({ configured: "http://localhost:3000/", surface: "web", dev: true }),
    ).toBe("http://localhost:3000");
  });

  it("ignores an empty string", () => {
    // An unset `EXPO_PUBLIC_API_URL` inlines as `""`, not as undefined. Treating
    // that as "same origin" would silently break the native build the check
    // below exists to catch.
    expect(() => resolveApiBaseUrl({ configured: "", surface: "native", dev: false })).toThrow(
      ApiBaseUrlError,
    );
  });
});
