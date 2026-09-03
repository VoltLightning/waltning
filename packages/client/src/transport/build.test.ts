/**
 * Version skew — the comparison itself, where it lives.
 *
 * This coverage moved here from `apps/mobile/src/platform.test.tsx` when the
 * app's API wiring left with the API-reading dashboard: the comparison never
 * belonged to a platform, and testing it through one meant losing the test
 * the day the platform stopped calling it.
 */

import { describe, expect, it } from "vitest";
import { DEV_BUILD, isStaleBundle } from "./build.ts";

describe("isStaleBundle", () => {
  it("says nothing while either side is a dev build", () => {
    // In development the bundle and the server change independently by design,
    // so reporting skew would be constant noise — and noise is how a real
    // warning gets ignored.
    expect(isStaleBundle(DEV_BUILD, DEV_BUILD)).toBe(false);
    expect(isStaleBundle(DEV_BUILD, "abc1234")).toBe(false);
    expect(isStaleBundle("abc1234", DEV_BUILD)).toBe(false);
  });

  it("reports two different image builds, and only two different ones", () => {
    expect(isStaleBundle("abc1234", "abc1234")).toBe(false);
    expect(isStaleBundle("abc1234", "def5678")).toBe(true);
  });
});
