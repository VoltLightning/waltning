import { describe, expect, it } from "vitest";
import { COMPACT_BELOW_HEIGHT, isCompactWindow } from "./compact-window.ts";

describe("isCompactWindow", () => {
  it("is compact on a 740 pt phone and not on a tall one at normal text size", () => {
    expect(isCompactWindow(740, 1)).toBe(true);
    expect(isCompactWindow(COMPACT_BELOW_HEIGHT, 1)).toBe(false);
    expect(isCompactWindow(900, 1)).toBe(false);
  });

  it("measures the window in text-scale-free points: a 915 pt window at 1.3x is compact", () => {
    expect(isCompactWindow(915, 1)).toBe(false);
    expect(isCompactWindow(915, 1.3)).toBe(true);
  });

  it("treats a missing or zero scale as 1", () => {
    expect(isCompactWindow(900, 0)).toBe(false);
  });
});
