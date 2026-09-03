import { describe, expect, it } from "vitest";
import { NO_INSETS } from "../primitives/safe-area";
import { floating } from "../tokens.ts";
import {
  clampFloat,
  defaultFloat,
  dockFrame,
  inDockBand,
  overshootOf,
  parseFloatPosition,
  releaseAt,
  serializeFloatPosition,
  settleSpring,
} from "./float-geometry.ts";

const phone = { width: 390, height: 844 };
const notched = { top: 59, right: 0, bottom: 34, left: 0 };

describe("the floating add button's geometry (§2.9)", () => {
  it("defaults to bottom-right, inset by 16 plus the device", () => {
    expect(defaultFloat(phone, NO_INSETS)).toEqual({
      x: 390 - 16 - floating.size,
      y: 844 - 16 - floating.size,
      dock: null,
    });
    const withNotch = defaultFloat(phone, notched);
    expect(withNotch.y).toBe(844 - 34 - 16 - floating.size);
  });

  it("settles against the nearer side, at the height it was dropped", () => {
    const from = defaultFloat(phone, NO_INSETS);
    expect(releaseAt(from, 120.5, 300.25, phone, NO_INSETS)).toEqual({
      x: 16,
      y: 300.25,
      dock: null,
    });
    expect(releaseAt(from, 200, 300.25, phone, NO_INSETS)).toEqual({
      x: 390 - 16 - floating.size,
      y: 300.25,
      dock: null,
    });
  });

  it("never rests on an edge — the inset holds on every side", () => {
    const from = defaultFloat(phone, notched);
    expect(releaseAt(from, -40, 10, phone, notched)).toEqual({ x: 16, y: 59 + 16, dock: null });
    expect(releaseAt(from, 900, 10, phone, notched)).toEqual({
      x: 390 - 16 - floating.size,
      y: 59 + 16,
      dock: null,
    });
  });

  it("bounces, and the bounce never reaches the edge", () => {
    for (const travel of [4, 30, 120, 340, 800, 1700]) {
      expect(overshootOf(travel), `travel ${travel}`).toBeLessThanOrEqual(
        floating.inset / 2 + 1e-9,
      );
    }
    // Short and long throws are different springs — the test that this is
    // not one constant wearing a formula.
    expect(settleSpring(30).damping).toBeLessThan(settleSpring(1700).damping);
    // A nudge still visibly bounces; a throw still settles rather than creeps.
    expect(overshootOf(30)).toBeGreaterThan(1);
    const { stiffness, damping, mass } = settleSpring(1700);
    expect(damping / (2 * Math.sqrt(stiffness * mass))).toBeLessThanOrEqual(0.9);
  });

  it("parks as a tab at the column it was pushed into the bottom band", () => {
    const from = { x: 100, y: 200, dock: null };
    const floor = 844 - 34 - 16 - floating.size;
    expect(inDockBand(floor, phone, notched)).toBe(false);
    expect(inDockBand(floor + floating.band, phone, notched)).toBe(false);
    const y = floor + floating.band + 1;
    expect(inDockBand(y, phone, notched)).toBe(true);
    const parked = releaseAt(from, 60, y, phone, notched);
    expect(parked).toEqual({ x: 100, y: 200, dock: 60 + floating.size / 2 });
    expect(dockFrame(parked.dock ?? 0, phone, notched)).toEqual({
      x: 60 + floating.size / 2 - floating.tab.width / 2,
      y: 844 - 34 - floating.tab.height,
    });
  });

  it("dropping it back at the default floats it", () => {
    const home = defaultFloat(phone, notched);
    expect(releaseAt(home, home.x, home.y, phone, notched)).toEqual(home);
  });

  it("keeps the whole tab on screen", () => {
    const parked = releaseAt({ x: 0, y: 0, dock: null }, -100, 840, phone, NO_INSETS);
    expect(parked.dock).toBe(floating.tab.width / 2);
  });

  it("clamps a stored position into a smaller frame without changing it", () => {
    const stored = { x: 900, y: 900, dock: null };
    const shown = clampFloat(stored, phone, NO_INSETS);
    expect(shown).toEqual(defaultFloat(phone, NO_INSETS));
    expect(stored).toEqual({ x: 900, y: 900, dock: null });
  });

  it("round-trips through the preference and refuses junk", () => {
    const position = { x: 12.5, y: 300, dock: 44 };
    expect(parseFloatPosition(serializeFloatPosition(position))).toEqual(position);
    expect(parseFloatPosition("not json")).toBeNull();
    expect(parseFloatPosition('{"x":"12","y":3,"dock":null}')).toBeNull();
    expect(parseFloatPosition('{"x":1,"y":2}')).toBeNull();
    expect(parseFloatPosition("null")).toBeNull();
  });
});
