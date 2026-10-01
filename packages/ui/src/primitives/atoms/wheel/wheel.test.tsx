/**
 * @vitest-environment jsdom
 *
 * **What a drum loses silently, and where each half can be caught.**
 *
 * The *answer* — which option is under the band — is only reported on
 * momentum-end, which `react-native-web` synthesises from real scrolling and
 * jsdom cannot produce. So the arithmetic is tested as arithmetic
 * (`rowAt`, `recentreTo`) and the settle itself is left to a real browser.
 *
 * The *cost* — one re-render per row crossed rather than one per frame — is
 * not testable here either, and the first version of this file pretended
 * otherwise: `fireEvent.scroll` never reaches `react-native-web`'s own scroll
 * plumbing, so "eight events inside one row re-rendered nothing" passed
 * because nothing had happened at all. It is pinned in Chrome instead
 * (`visual/wheel.spec.ts`), against real scrolling.
 */

import { render } from "@testing-library/react";
import type { ComponentProps } from "react";
import { describe, expect, it, vi } from "vitest";
import { ThemeProvider } from "../../../theme/provider";
import { light } from "../../../theme/roles.ts";
import { recentreTo, rowAt, WHEEL_ROW, Wheel, type WheelOption } from "./wheel";

/** Every row's renders, by its label — `Row` draws exactly one `PressableScaled`. */
const renders = new Map<string, number>();
vi.mock("../pressable-scaled/pressable-scaled", async (importOriginal) => {
  const real = await importOriginal<typeof import("../pressable-scaled/pressable-scaled")>();
  function Counted(props: ComponentProps<typeof real.PressableScaled>) {
    const name = String(props.accessibilityLabel);
    renders.set(name, (renders.get(name) ?? 0) + 1);
    return <real.PressableScaled {...props} />;
  }
  return { ...real, PressableScaled: Counted };
});

/** Bracketed so a count of `[1]` cannot also match inside `[10]`. */
const DAYS: WheelOption[] = Array.from({ length: 31 }, (_, i) => ({
  value: String(i + 1),
  label: `[${i + 1}]`,
}));

const HOURS: WheelOption[] = Array.from({ length: 24 }, (_, i) => ({
  value: String(i),
  label: `[${String(i).padStart(2, "0")}]`,
}));

function occurrences(text: string, needle: string): number {
  return text.split(needle).length - 1;
}

describe("the option under the band", () => {
  it("is the one the offset rounds to", () => {
    expect(rowAt(0, 31), "resting at the top").toBe(0);
    expect(rowAt(17 * WHEEL_ROW, 31), "the 18th").toBe(17);
    // A thumb never stops exactly on a row; the nearest one wins.
    expect(rowAt(17 * WHEEL_ROW + 12, 31), "just past a row").toBe(17);
    expect(rowAt(17 * WHEEL_ROW - 12, 31), "just short of one").toBe(17);
  });

  it("wraps through both ends of a cycle", () => {
    // One row above :00 in the middle copy of a 12-row cycle is :55.
    expect(rowAt((12 - 1) * WHEEL_ROW, 12), "up from the first").toBe(11);
    expect(rowAt(24 * WHEEL_ROW, 12), "a whole cycle on").toBe(0);
  });
});

describe("a wrapping wheel returns to its middle copy", () => {
  it("only once it has left it", () => {
    expect(recentreTo(24 * WHEEL_ROW, 24), "dead centre").toBeNull();
    expect(recentreTo((24 + 23) * WHEEL_ROW, 24), "last row of the middle copy").toBeNull();
  });

  it("to an offset showing the very same value", () => {
    const length = 24;
    for (const at of [0, 5, 23, 48, 60, 71]) {
      const home = recentreTo(at * WHEEL_ROW, length);
      if (home === null) continue;
      expect(rowAt(home, length), `from row ${at}`).toBe(rowAt(at * WHEEL_ROW, length));
      expect(home, `from row ${at} lands in the middle copy`).toBeGreaterThanOrEqual(
        length * WHEEL_ROW,
      );
    }
  });
});

describe("Wheel", () => {
  it("draws a scale once and a cycle three times", () => {
    const scale = render(
      <ThemeProvider theme={light}>
        <Wheel label="Day" options={DAYS} value="1" onChange={vi.fn()} width={56} />
      </ThemeProvider>,
    );
    expect(occurrences(scale.container.textContent ?? "", "[31]"), "a scale").toBe(1);
    scale.unmount();

    const cycle = render(
      <ThemeProvider theme={light}>
        <Wheel label="Hour" options={HOURS} value="0" onChange={vi.fn()} wraps width={72} />
      </ThemeProvider>,
    );
    expect(occurrences(cycle.container.textContent ?? "", "[23]"), "a cycle").toBe(3);
    cycle.unmount();
  });

  /**
   * **A long column costs a move only the rows whose look changed.** The year
   * column is 201 rows; moving the band one year restyles the six rows around
   * it. Unmemoised — or memoised on the raw distance, which every row's
   * changes — it re-rendered all 201.
   */
  it("re-renders only the rows around the band when the value moves", () => {
    const years: WheelOption[] = Array.from({ length: 201 }, (_, i) => {
      const year = String(1926 + i);
      return { value: year, label: year };
    });
    const onChange = vi.fn();
    const view = render(
      <ThemeProvider theme={light}>
        <Wheel label="Year" options={years} value="2026" onChange={onChange} width={76} />
      </ThemeProvider>,
    );
    renders.clear();
    view.rerender(
      <ThemeProvider theme={light}>
        <Wheel label="Year" options={years} value="2027" onChange={onChange} width={76} />
      </ThemeProvider>,
    );
    expect([...renders.keys()].sort(), "the rows whose class changed").toEqual([
      "2024",
      "2025",
      "2026",
      "2027",
      "2028",
      "2029",
    ]);
    view.unmount();
  });
});
