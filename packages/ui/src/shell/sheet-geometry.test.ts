import { describe, expect, it } from "vitest";
import { NO_INSETS } from "../primitives/safe-area";
import { SHEET_TOP_OFFSET, sheetBounds, sheetTopEdge } from "./sheet-geometry.ts";

/** iPhone 14 — the phone the keyboard case was worked through on. */
const PHONE = { width: 390, height: 844 };
const NOTCHED = { top: 59, right: 0, bottom: 34, left: 0 };
/** Roughly what iOS reports for the default keyboard on that phone. */
const KEYBOARD = 336;

describe("sheetBounds", () => {
  it("caps at the window less §5.1's own top offset", () => {
    const bounds = sheetBounds(PHONE, NO_INSETS, 0);
    expect(bounds.maxHeight).toBe(844 - SHEET_TOP_OFFSET);
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
   * H3, as a number. Where the keyboard overlays the window (`keyboard.ts`)
   * the window height does not change, so a sheet capped against it alone
   * kept drawing under the keyboard — with the pinned footer, its last child,
   * in the covered third. `KeyboardAvoidingView` lifts the sheet to sit on
   * the keyboard's top edge; this is the half that has to shrink with it, or
   * the lift pushes the sheet's head straight off the top of the window.
   */
  it("shrinks the cap by exactly what the lift will take", () => {
    const bounds = sheetBounds(PHONE, NOTCHED, KEYBOARD);
    expect(bounds.maxHeight).toBe(844 - SHEET_TOP_OFFSET - KEYBOARD);
  });

  it("leaves the lifted sheet's head inside the window", () => {
    const bounds = sheetBounds(PHONE, NOTCHED, KEYBOARD);
    // Lifted to the keyboard's top edge, the sheet still starts at the offset.
    expect(sheetTopEdge(PHONE, KEYBOARD, bounds)).toBe(SHEET_TOP_OFFSET);
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
