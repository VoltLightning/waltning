/**
 * Where the floating add button is, as arithmetic.
 *
 * `design-system/02` §2.9: let go of the button and it settles against the
 * nearer side edge — 16px in, never touching — at the height it was dropped;
 * pushed off the bottom it parks as a tab at that column; tapping the tab
 * returns it to its last floating position. Every one of those sentences is a
 * function here, with no React in it, so the rules can be tested as rules and
 * the component is left with the gesture and the spring.
 *
 * Coordinates are the button's **top-left corner in the frame it floats
 * over**, in points. Not fractions of the screen: a fraction re-derives the
 * height on every resize, and the height is the one thing the user chose. A
 * frame that shrinks below a stored position clamps it at render
 * (`clampFloat`) and writes nothing back — the phone rotating is not the user
 * moving the button.
 */

import type { SafeAreaInsets } from "../primitives/safe-area";
import { floating } from "../tokens.ts";

/**
 * The device preference. `dock` is the tab's centre column when parked, and
 * `null` while floating; `x`/`y` are the last floating position either way,
 * which is what "returns to where it was" needs.
 */
export type FloatPosition = { x: number; y: number; dock: number | null };

export type FloatBounds = { width: number; height: number };

type Range = { minX: number; maxX: number; minY: number; maxY: number };

/** The rectangle the button's top-left corner may occupy. */
function range(bounds: FloatBounds, insets: SafeAreaInsets): Range {
  const minX = insets.left + floating.inset;
  const minY = insets.top + floating.inset;
  return {
    minX,
    minY,
    maxX: Math.max(minX, bounds.width - insets.right - floating.inset - floating.size),
    maxY: Math.max(minY, bounds.height - insets.bottom - floating.inset - floating.size),
  };
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}

/** Bottom-right, inset by 16 plus the device — where a thumb already is. */
export function defaultFloat(bounds: FloatBounds, insets: SafeAreaInsets): FloatPosition {
  const r = range(bounds, insets);
  return { x: r.maxX, y: r.maxY, dock: null };
}

/**
 * A stored position brought inside the current frame. The stored value is
 * left alone — this is a rendering of it, not a correction.
 */
export function clampFloat(
  position: FloatPosition,
  bounds: FloatBounds,
  insets: SafeAreaInsets,
): FloatPosition {
  const r = range(bounds, insets);
  return {
    x: clamp(position.x, r.minX, r.maxX),
    y: clamp(position.y, r.minY, r.maxY),
    dock: position.dock === null ? null : clampDock(position.dock, bounds, insets),
  };
}

/** A tab column, kept on screen with the whole tab visible. */
export function clampDock(column: number, bounds: FloatBounds, insets: SafeAreaInsets): number {
  const half = floating.tab.width / 2;
  const min = insets.left + half;
  const max = Math.max(min, bounds.width - insets.right - half);
  return clamp(column, min, max);
}

/**
 * Whether a drag that ended with the button's top-left at `(x, y)` was pushed
 * past its resting floor by at least the band — off the bottom, into the
 * safe area. A drop at the floor itself floats: that is where the default
 * position sits.
 */
export function inDockBand(y: number, bounds: FloatBounds, insets: SafeAreaInsets): boolean {
  return y > range(bounds, insets).maxY + floating.band;
}

/**
 * How far a drag may carry the button while the finger is down. Wider than
 * the resting range at the bottom only: the button may hang half off the
 * safe area's edge, which is what makes the parking gesture visible before
 * the finger lifts.
 */
export function dragRange(
  bounds: FloatBounds,
  insets: SafeAreaInsets,
): { minX: number; maxX: number; minY: number; maxY: number } {
  const r = range(bounds, insets);
  return { ...r, maxY: Math.max(r.maxY, bounds.height - insets.bottom - floating.size / 2) };
}

/**
 * The result of releasing a drag at `(x, y)` from `previous`: the nearer side
 * edge at the dropped height, or the previous floating position with a dock
 * column where the finger let go.
 *
 * Side edges only. A button that also magnetised to the top would sit over
 * the header's figures, and the bottom edge already has a meaning — parking.
 */
export function releaseAt(
  previous: FloatPosition,
  x: number,
  y: number,
  bounds: FloatBounds,
  insets: SafeAreaInsets,
): FloatPosition {
  if (inDockBand(y, bounds, insets)) {
    return { x: previous.x, y: previous.y, dock: clampDock(x + floating.size / 2, bounds, insets) };
  }
  const r = range(bounds, insets);
  const centre = x + floating.size / 2;
  const nearer = centre < (r.minX + r.maxX + floating.size) / 2 ? r.minX : r.maxX;
  return { x: nearer, y: clamp(y, r.minY, r.maxY), dock: null };
}

/**
 * The spring that carries the button from where it was dropped to where it
 * settles, chosen so the bounce **never reaches the edge**.
 *
 * A spring overshoots by a fraction of its travel that depends only on its
 * damping ratio ζ — `exp(−πζ / √(1−ζ²))` — so a fixed ζ that bounces nicely
 * across a phone would carry a desk-width drop straight through the 16px
 * inset. Instead the ratio is solved from the travel so the overshoot is at
 * most half the inset: a long throw arrives firmly, a short nudge bounces
 * visibly, and neither touches the wall. ζ is floored at 0.5 so a nudge of a
 * few pixels does not wobble, and capped at 0.9 so a throw still settles
 * rather than creeps.
 *
 * Returned as React Native's physical parameters (`stiffness`, `damping`,
 * `mass`), which are the ones both drivers accept.
 */
export function settleSpring(travel: number): { stiffness: number; damping: number; mass: number } {
  const stiffness = 220;
  const mass = 1;
  const budget = floating.inset / 2;
  const fraction = Math.min(0.99, budget / Math.max(travel, 1));
  const logDecrement = Math.log(1 / fraction);
  const solved = logDecrement / Math.sqrt(Math.PI * Math.PI + logDecrement * logDecrement);
  const zeta = clamp(solved, 0.5, 0.9);
  return { stiffness, damping: 2 * zeta * Math.sqrt(stiffness * mass), mass };
}

/** The overshoot a `settleSpring(travel)` produces, for the test that pins it. */
export function overshootOf(travel: number): number {
  const { stiffness, damping, mass } = settleSpring(travel);
  const zeta = damping / (2 * Math.sqrt(stiffness * mass));
  return travel * Math.exp((-Math.PI * zeta) / Math.sqrt(1 - zeta * zeta));
}

/** The tab's top-left corner for a dock column: on top of the safe area. */
export function dockFrame(
  column: number,
  bounds: FloatBounds,
  insets: SafeAreaInsets,
): { x: number; y: number } {
  return {
    x: clampDock(column, bounds, insets) - floating.tab.width / 2,
    y: bounds.height - insets.bottom - floating.tab.height,
  };
}

/**
 * The preference off the disk. Anything but three finite numbers (or `null`
 * for `dock`) is not a position, and the answer to a corrupt preference is the
 * default, never a throw at startup.
 */
export function parseFloatPosition(raw: string): FloatPosition | null {
  let value: unknown;
  try {
    value = JSON.parse(raw);
  } catch {
    return null;
  }
  if (typeof value !== "object" || value === null) return null;
  const { x, y, dock } = value as Record<string, unknown>;
  if (!Number.isFinite(x) || !Number.isFinite(y)) return null;
  if (dock !== null && !Number.isFinite(dock)) return null;
  return { x: x as number, y: y as number, dock: dock as number | null };
}

export function serializeFloatPosition(position: FloatPosition): string {
  return JSON.stringify(position);
}
