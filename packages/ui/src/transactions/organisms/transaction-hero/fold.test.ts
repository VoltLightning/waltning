import { describe, expect, it } from "vitest";
import { bandOpacity, dateOpacity, titleOpacity } from "./fold.ts";

describe("the header fold", () => {
  it("keeps the amount readable in one place or the other at every point", () => {
    for (let y = 0; y <= 160; y += 1) {
      expect(Math.max(bandOpacity(y), titleOpacity(y)), `at ${y}pt`).toBeGreaterThanOrEqual(0.5);
    }
  });

  it("never draws the date and the name in the header at once", () => {
    for (let y = 0; y <= 160; y += 1) {
      expect(Math.min(dateOpacity(y), titleOpacity(y)), `at ${y}pt`).toBe(0);
    }
  });

  it("rests on the band and ends on the header", () => {
    expect([bandOpacity(0), dateOpacity(0), titleOpacity(0)]).toEqual([1, 1, 0]);
    expect([bandOpacity(200), dateOpacity(200), titleOpacity(200)]).toEqual([0, 0, 1]);
  });
});
