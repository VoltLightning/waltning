import { describe, expect, it } from "vitest";
import { previewResetEnabled } from "./preview-reset.ts";

describe("previewResetEnabled", () => {
  it.each([
    [false, undefined, false],
    [false, "false", false],
    [false, "true", true],
    [true, undefined, true],
  ] as const)("with dev=%s and configured=%s returns %s", (dev, configured, expected) => {
    expect(previewResetEnabled(dev, configured)).toBe(expected);
  });
});
