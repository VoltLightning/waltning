/**
 * `envelope` is plain arithmetic — no Reanimated `interpolate` in it — so it
 * is exercised for real here rather than through the no-op stand-in
 * `.vitest/reanimated.ts` gives that call. A sweep, not a handful of spot
 * values: the row-goes-flat bug (equal thirds vs. sixths, half-width 0.4 vs.
 * 1/3) only shows up between the sampled dot phases, not at them.
 */
import { describe, expect, it } from "vitest";
import { envelope } from "./thinking-indicator";

const DOT_PHASES = [0, 1 / 3, 2 / 3] as const;
const STEPS = 900;

function sweep(phase: number): number[] {
  const values: number[] = [];
  for (let i = 0; i < STEPS; i++) values.push(envelope(i / STEPS, phase));
  return values;
}

describe("envelope", () => {
  const perDot = DOT_PHASES.map(sweep);

  it("never lets the row go flat — some dot is always at least half-lifted", () => {
    for (let i = 0; i < STEPS; i++) {
      const atStep = perDot.map((values) => values[i] as number);
      expect(Math.max(...atStep)).toBeGreaterThanOrEqual(0.5);
    }
  });

  it("is continuous across the 0/1 wrap for every dot", () => {
    for (const values of perDot) {
      const atZero = values[0] as number;
      const atLast = values[STEPS - 1] as number;
      expect(Math.abs(atZero - atLast)).toBeLessThan(0.02);
    }
  });

  it("peaks in order — dot 1, then dot 2, then dot 3 — within one cycle", () => {
    const peakTimes = perDot.map((values) => {
      let bestIndex = 0;
      let bestValue = -Infinity;
      for (let i = 0; i < values.length; i++) {
        const value = values[i] as number;
        if (value > bestValue) {
          bestValue = value;
          bestIndex = i;
        }
      }
      return bestIndex / STEPS;
    });
    const [dot1, dot2, dot3] = peakTimes as [number, number, number];
    expect(dot1).toBeLessThan(dot2);
    expect(dot2).toBeLessThan(dot3);
  });
});
