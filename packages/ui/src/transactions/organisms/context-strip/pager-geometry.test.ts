import { describe, expect, it } from "vitest";
import { pageAt, pagerGeometry } from "./pager-geometry.ts";

const COLUMN = 680;
const PORTRAIT = { lead: 20, trail: 20, gap: 10, column: COLUMN };
const LANDSCAPE = { lead: 20 + 59, trail: 20 + 59, gap: 10, column: COLUMN };

/** The details card: between the same paddings, capped at the same column. */
function detailsWidth(width: number, pad: { lead: number; trail: number; column: number }) {
  return Math.min(width - pad.lead - pad.trail, pad.column);
}

describe("the context strip's pager", () => {
  it.each([
    [320, PORTRAIT],
    [390, PORTRAIT],
    [430, PORTRAIT],
    [768, PORTRAIT],
    [1000, PORTRAIT],
    [852, LANDSCAPE],
  ] as const)("at %ipt, a card is exactly as wide as the details card", (width, pad) => {
    expect(pagerGeometry(width, 2, pad).cardWidth).toBe(detailsWidth(width, pad));
  });

  it.each([
    [390, PORTRAIT],
    [768, PORTRAIT],
    [852, LANDSCAPE],
  ] as const)(
    "at %ipt, every stop puts a card on the gutter and the last is the end of the row",
    (width, pad) => {
      for (const count of [2, 3]) {
        const { cardWidth, snaps, trailPad } = pagerGeometry(width, count, pad);
        const content = pad.lead + count * cardWidth + (count - 1) * pad.gap + trailPad;
        expect(snaps.at(-1)).toBe(content - width);
        snaps.forEach((stop, index) => {
          expect(pad.lead + index * (cardWidth + pad.gap) - stop).toBe(pad.lead);
        });
      }
    },
  );

  it("reads the page nearest the offset", () => {
    const { snaps } = pagerGeometry(390, 2, PORTRAIT);
    const second = snaps[1] ?? 0;
    expect(pageAt(snaps, 0)).toBe(0);
    expect(pageAt(snaps, second)).toBe(1);
    expect(pageAt(snaps, second / 2 - 1)).toBe(0);
    expect(pageAt(snaps, second / 2 + 1)).toBe(1);
  });
});
