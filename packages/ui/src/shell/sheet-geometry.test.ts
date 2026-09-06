import { describe, expect, it } from "vitest";
import { NO_INSETS } from "../primitives/safe-area";
import { SHEET_TOP_OFFSET, sheetBottomEdge, sheetBounds } from "./sheet-geometry.ts";

/** iPhone 14 — the phone the keyboard case was worked through on. */
const PHONE = { width: 390, height: 844 };
const NOTCHED = { top: 59, right: 0, bottom: 34, left: 0 };
/** Roughly what iOS reports for the default keyboard on that phone. */
const KEYBOARD = 336;

describe("sheetBounds", () => {
  it("caps at the window less §5.1's own top offset", () => {
    const bounds = sheetBounds(PHONE, NO_INSETS, 0);
    expect(bounds.maxHeight).toBe(844 - SHEET_TOP_OFFSET);
    expect(bounds.marginBottom).toBe(0);
  });

  it("yields to a top inset larger than the design offset", () => {
    const bounds = sheetBounds(PHONE, { top: 200, right: 0, bottom: 34, left: 0 }, 0);
    expect(bounds.maxHeight).toBe(844 - 222);
  });

  it("pads the home indicator rather than shortening the sheet by it", () => {
    expect(sheetBounds(PHONE, NOTCHED, 0).paddingBottom).toBe(22 + 34);
  });

  it("never returns less than three targets, however short the window", () => {
    expect(sheetBounds({ width: 390, height: 120 }, NO_INSETS, 0).maxHeight).toBe(132);
  });
});

describe("sheetBounds, with the keyboard up", () => {
  /**
   * H3, as a number. On iOS the window height does not change when the
   * keyboard opens, so a sheet capped against the window alone kept drawing
   * under it — and the pinned footer, which is the sheet's last child, is in
   * the covered third. The footer's own bottom edge must land at or above the
   * keyboard's top edge.
   */
  it("lifts the sheet so its footer sits above the keyboard rect", () => {
    const bounds = sheetBounds(PHONE, NOTCHED, KEYBOARD);
    const keyboardTop = PHONE.height - KEYBOARD;

    expect(sheetBottomEdge(PHONE, bounds)).toBeLessThanOrEqual(keyboardTop);
    expect(bounds.marginBottom).toBe(KEYBOARD);
  });

  /** Lifting alone would push the head off the top; the cap shrinks with it. */
  it("shrinks the cap by the same amount it lifts", () => {
    const bounds = sheetBounds(PHONE, NOTCHED, KEYBOARD);
    expect(bounds.maxHeight).toBe(844 - SHEET_TOP_OFFSET - KEYBOARD);
    // Head and foot both inside the window.
    const top = sheetBottomEdge(PHONE, bounds) - (bounds.maxHeight as number);
    expect(top).toBeGreaterThanOrEqual(SHEET_TOP_OFFSET);
  });

  /** The home indicator is behind the keyboard — clearing it there clears it twice. */
  it("drops the bottom inset while the keyboard covers it", () => {
    expect(sheetBounds(PHONE, NOTCHED, KEYBOARD).paddingBottom).toBe(22);
  });

  /** A keyboard taller than the room left still leaves a usable sheet. */
  it("keeps the three-target floor under a keyboard that eats the window", () => {
    expect(sheetBounds(PHONE, NOTCHED, 700).maxHeight).toBe(132);
  });
});
