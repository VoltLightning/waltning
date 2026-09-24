import { describe, expect, it } from "vitest";
import { pageAt, pagerGeometry } from "./pager-geometry.ts";

const PORTRAIT = { lead: 20, trail: 20, gap: 10 };
const LANDSCAPE = { lead: 20 + 59, trail: 20 + 59, gap: 10 };

describe("the context strip's pager", () => {
  it.each([
    [320, PORTRAIT],
    [390, PORTRAIT],
    [430, PORTRAIT],
    [768, PORTRAIT],
    [852, LANDSCAPE],
  ] as const)("at %ipt, a card is as wide as the page's other cards", (width, pad) => {
    const { cardWidth } = pagerGeometry(width, 2, pad);
    // The details card below sits between the same two paddings.
    expect(cardWidth).toBe(width - pad.lead - pad.trail);
  });

  it.each([2, 3])("with %i cards, the last stop is exactly the end of the row", (count) => {
    for (const [width, pad] of [
      [390, PORTRAIT],
      [852, LANDSCAPE],
    ] as const) {
      const { cardWidth, snaps } = pagerGeometry(width, count, pad);
      const content = pad.lead + count * cardWidth + (count - 1) * pad.gap + pad.trail;
      expect(snaps.at(-1)).toBe(content - width);
      // Each stop puts a card on the gutter.
      snaps.forEach((stop, index) => {
        expect(pad.lead + index * (cardWidth + pad.gap) - stop).toBe(pad.lead);
      });
    }
  });

  it("reads the page nearest the offset", () => {
    const { snaps } = pagerGeometry(390, 2, PORTRAIT);
    expect(pageAt(snaps, 0)).toBe(0);
    expect(pageAt(snaps, snaps[1] ?? 0)).toBe(1);
    expect(pageAt(snaps, (snaps[1] ?? 0) / 2 - 1)).toBe(0);
    expect(pageAt(snaps, (snaps[1] ?? 0) / 2 + 1)).toBe(1);
  });
});
