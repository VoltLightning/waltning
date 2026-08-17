/**
 * @vitest-environment jsdom
 *
 * The wiring between the platform and the resolver.
 *
 * `base-url.test.ts` covers every decision `resolveApiBaseUrl` makes. What it
 * cannot cover is the three lines that feed it — `Platform.OS`, `__DEV__` and
 * `EXPO_PUBLIC_API_URL` — because `api.ts` imports `react-native` and a Node
 * test cannot load it. So the decisions were tested and the inputs were not,
 * and a swapped comparison there would have sent every request to the wrong
 * place while every test stayed green.
 *
 * Under jsdom with `react-native` aliased to `react-native-web`, `Platform.OS`
 * is `"web"` — which is the surface this file can honestly speak for.
 */

import { describe, expect, it } from "vitest";

describe("API_BASE_URL", () => {
  it("resolves the dev API for the web surface", async () => {
    // `__DEV__` is Metro's, injected into the bundle. Set before the import
    // because `api.ts` resolves at module evaluation — deliberately, so a
    // misconfigured native build fails at startup rather than at first fetch.
    Object.assign(globalThis, { __DEV__: true });

    const { API_BASE_URL } = await import("./api.ts");

    expect(API_BASE_URL).toBe("http://localhost:3000");
  });

  it("builds a client against that URL", async () => {
    Object.assign(globalThis, { __DEV__: true });

    const { api } = await import("./api.ts");

    // Not a call — that needs a server. This asserts the client was constructed
    // with the operation surface attached, which is what catches a registry
    // that failed to reach the client at all.
    expect(typeof api.op.get_currencies.query).toBe("function");
    expect(typeof api.ping.query).toBe("function");
  });
});

describe("isStaleBundle", () => {
  it("says nothing in development", async () => {
    // Both sides read `dev` when no image was involved. The bundle and the
    // server change independently there by design, so reporting skew would be
    // constant noise — and noise is how a real warning gets ignored.
    Object.assign(globalThis, { __DEV__: true });
    const { isStaleBundle } = await import("./api.ts");
    expect(isStaleBundle("dev")).toBe(false);
    expect(isStaleBundle("abc1234")).toBe(false);
  });
});
