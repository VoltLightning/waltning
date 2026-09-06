import { describe, expect, it } from "vitest";
import { panelPlacement, unanchoredPlacement } from "./anchor.ts";
import { NO_INSETS } from "./safe-area";

/** A 390×793 phone — the window the mobile audit was measured against. */
const WINDOW = { width: 390, height: 793 };
/** `Select`'s own cap: six and a half 44px rows. */
const CAP = 286;

const FIELD = { x: 22, y: 200, width: 346, height: 44 };

describe("panelPlacement", () => {
  it("opens under the field, at its own width", () => {
    const style = panelPlacement(FIELD, WINDOW, NO_INSETS, CAP);
    expect(style.top).toBe(248); // 200 + 44 + 4
    expect(style.left).toBe(22);
    expect(style.width).toBe(346);
  });

  it("never grows past the cap when the room is there", () => {
    const style = panelPlacement(FIELD, WINDOW, NO_INSETS, CAP);
    expect(style.maxHeight).toBe(CAP);
  });

  /**
   * The half of the rule the flow layout never had to answer: a field near the
   * bottom has nothing under it, and a panel drawn there would be off-window.
   */
  it("flips above the field when below is the smaller room", () => {
    const low = { ...FIELD, y: 700 };
    const style = panelPlacement(low, WINDOW, NO_INSETS, CAP);
    // Its own height and the gap, taken off the field's top edge.
    expect(style.top).toBe(700 - 4 - CAP);
    expect(style.maxHeight).toBe(CAP);
  });

  /**
   * The device's own chrome is room the panel does not have. A field near the
   * top of a short window has nowhere to flip to, so the home indicator is
   * what decides how many rows fit.
   */
  it("subtracts the safe area from the room it thinks it has", () => {
    const short = { width: 390, height: 400 };
    const insets = { top: 59, right: 0, bottom: 34, left: 0 };
    const style = panelPlacement({ ...FIELD, y: 40 }, short, insets, CAP);
    // 400 − 34 − 8 − (40 + 44 + 4) = 270, short of the 286 cap.
    expect(style.top).toBe(88);
    expect(style.maxHeight).toBe(270);
  });

  /** Two rows, never less: a panel squeezed to nothing is a panel nobody can use. */
  it("keeps two rows even where neither side has room", () => {
    const squeezed = { x: 22, y: 40, width: 346, height: 44 };
    const style = panelPlacement(squeezed, { width: 390, height: 100 }, NO_INSETS, CAP);
    expect(style.maxHeight).toBe(88);
  });

  /**
   * L1: the floor can be bigger than the room it was given, which is what it
   * is for — but a panel placed by its far edge then hung 52px off the top of
   * the window and the old test, asserting only `maxHeight`, could not see
   * it. The floor wins over the room; the window wins over the floor.
   */
  it("stays inside the window even when the two-row floor beats the room", () => {
    const squeezed = { x: 22, y: 40, width: 346, height: 44 };
    const frame = { width: 390, height: 100 };
    const style = panelPlacement(squeezed, frame, NO_INSETS, CAP);
    const top = style.top as number;
    // A 100px window cannot hold 88 rows *and* both 8px margins, so the
    // margin gives way — the window does not.
    expect(top).toBeGreaterThanOrEqual(0);
    expect(top + (style.maxHeight as number)).toBeLessThanOrEqual(frame.height);
  });

  /** The mirror case, below a field with a little room under it. */
  it("stays inside the window when the floor beats the room below", () => {
    const frame = { width: 390, height: 160 };
    const field = { x: 22, y: 50, width: 346, height: 44 };
    const style = panelPlacement(field, frame, NO_INSETS, CAP);
    const top = style.top as number;
    expect(top + (style.maxHeight as number)).toBeLessThanOrEqual(frame.height - 8);
  });

  /** A field wider than the window, or hard against its edge, still lands inside it. */
  it("stays inside the window's own margins", () => {
    const wide = { x: -20, y: 200, width: 500, height: 44 };
    const style = panelPlacement(wide, WINDOW, NO_INSETS, CAP);
    expect(style.width).toBe(374); // 390 − 8 − 8
    expect(style.left).toBe(8);
  });
});

describe("unanchoredPlacement", () => {
  /** The single tick before the field answers — legible, and never seen. */
  it("fills the window's width at its bottom edge", () => {
    const style = unanchoredPlacement(WINDOW, { top: 59, right: 0, bottom: 34, left: 0 }, CAP);
    expect(style.left).toBe(8);
    expect(style.right).toBe(8);
    expect(style.bottom).toBe(42);
    expect(style.maxHeight).toBe(CAP);
  });
});
