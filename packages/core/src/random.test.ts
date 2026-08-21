/**
 * `randomId()` — and the runtime that does not have one.
 *
 * The bug this replaces was invisible from a laptop: `crypto.randomUUID()` was
 * called directly in the SQLite id default and the outbox entry id, both of
 * which only run on the phone, and neither React Native nor Expo defines a
 * `crypto` global. It typechecked because `tsc` finds `@types/node` at the
 * workspace root, which declares a global Node has and the device does not.
 */

import { afterEach, describe, expect, it } from "vitest";
import { canMintIds, randomId } from "./random.ts";

const real = globalThis.crypto;

afterEach(() => {
  Object.defineProperty(globalThis, "crypto", { value: real, configurable: true });
});

/** Stand in for React Native, which has no `crypto` at all. */
function withoutCrypto(): void {
  Object.defineProperty(globalThis, "crypto", { value: undefined, configurable: true });
}

describe("where the runtime provides one", () => {
  it("mints a distinct id each time", () => {
    const ids = new Set(Array.from({ length: 500 }, randomId));
    expect(ids.size, "no collisions in 500").toBe(500);
  });

  it("mints something UUID-shaped", () => {
    expect(randomId()).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/,
    );
  });

  it("says it can", () => {
    expect(canMintIds()).toBe(true);
  });
});

describe("where it does not — the phone, before the polyfill", () => {
  /**
   * **Throws rather than falling back**, and a fallback would be worse than the
   * crash. These ids are the idempotency keys the server deduplicates on (C22),
   * so `Math.random` here means two captures can collide and one write is
   * silently discarded as a replay of the other. A loud failure at the first
   * insert is the cheaper outcome by a wide margin.
   */
  it("throws with an instruction, not a TypeError", () => {
    withoutCrypto();

    expect(() => randomId()).toThrow(/React Native does not provide one/);
    expect(() => randomId()).toThrow(/polyfill at the app entry point/);
  });

  it("reports that it cannot, without throwing", () => {
    withoutCrypto();
    expect(canMintIds()).toBe(false);
  });

  /** A `crypto` that exists but lacks the method — the shape a partial polyfill leaves. */
  it("is not fooled by a crypto object without the method", () => {
    Object.defineProperty(globalThis, "crypto", { value: {}, configurable: true });

    expect(canMintIds()).toBe(false);
    expect(() => randomId()).toThrow(/no crypto.randomUUID/);
  });
});
