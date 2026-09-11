/** @vitest-environment jsdom */

import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ThemeProvider } from "../../../theme/provider";
import { light } from "../../../theme/roles.ts";
import { cellFor, DayRibbon, offsetFor, type RibbonDay } from "./day-ribbon";

// Count what actually rendered rather than trusting `memo`, which is a hint
// the reconciler may ignore and which stops working silently the moment a
// parent hands down a fresh object or arrow.
const renders = new Map<string, number>();
vi.mock("../../atoms/day-cell/day-cell", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../../atoms/day-cell/day-cell")>();
  const Real = actual.DayCell;
  const Counted = (props: Parameters<typeof Real>[0]) => {
    const key = props.accessibilityLabel;
    renders.set(key, (renders.get(key) ?? 0) + 1);
    return <Real {...props} />;
  };
  return { ...actual, DayCell: Counted };
});

const QUIET: RibbonDay = {
  date: "2026-08-13",
  day: 13,
  weekday: "W",
  activity: "none",
  label: "Wednesday 13 August, nothing",
};
const HEAVY: RibbonDay = {
  date: "2026-08-14",
  day: 14,
  weekday: "T",
  activity: "heavy",
  direction: "out",
  label: "Thursday 14 August, 296 out, 3 entries",
};
const SOME: RibbonDay = {
  date: "2026-08-15",
  day: 15,
  weekday: "F",
  activity: "some",
  direction: "in",
  label: "Friday 15 August, 7 850 in, 1 entry",
};
const DAYS: readonly RibbonDay[] = [QUIET, HEAVY, SOME];

function draw(props: Partial<Parameters<typeof DayRibbon>[0]> = {}) {
  const onPickDay = props.onPickDay ?? vi.fn();
  const view = render(
    <ThemeProvider theme={light}>
      <DayRibbon days={DAYS} current="2026-08-14" onPickDay={onPickDay} {...props} />
    </ThemeProvider>,
  );
  return { ...view, onPickDay };
}

beforeEach(() => renders.clear());

it("names a day by its date and what happened, never by the bare number", () => {
  draw();
  // The number is what the eye reads; it is not what a screen reader should hear.
  expect(screen.getByRole("button", { name: /Thursday 14 August, 296 out/ })).toBeTruthy();
  expect(screen.queryByRole("button", { name: "14" })).toBeNull();
});

it("asks the list to move rather than marking anything itself", () => {
  const { onPickDay } = draw();
  screen.getByRole("button", { name: /Friday 15 August/ }).click();
  // The ribbon reports; it does not select. Tapping asks the list to go
  // there and nothing else — the mark moves when the list does, which the
  // re-render test below is what actually proves.
  expect(onPickDay).toHaveBeenCalledExactlyOnceWith("2026-08-15");
});

it("re-renders only the two cells whose mark changed when the list moves a day", () => {
  const onPickDay = vi.fn();
  const view = render(
    <ThemeProvider theme={light}>
      <DayRibbon days={DAYS} current="2026-08-14" onPickDay={onPickDay} />
    </ThemeProvider>,
  );
  const before = new Map(renders);

  view.rerender(
    <ThemeProvider theme={light}>
      <DayRibbon days={DAYS} current="2026-08-15" onPickDay={onPickDay} />
    </ThemeProvider>,
  );

  const delta = (label: string) => (renders.get(label) ?? 0) - (before.get(label) ?? 0);
  // The day that lost the mark and the day that gained it, and nothing else.
  expect(delta(HEAVY.label)).toBe(1);
  expect(delta(SOME.label)).toBe(1);
  expect(delta(QUIET.label)).toBe(0);
});

it("re-renders no cell at all when only the parent re-rendered", () => {
  const onPickDay = vi.fn();
  const tree = (
    <ThemeProvider theme={light}>
      <DayRibbon days={DAYS} current="2026-08-14" onPickDay={onPickDay} />
    </ThemeProvider>
  );
  const view = render(tree);
  const before = renders.get(HEAVY.label) ?? 0;

  // A strip whose label changed — "August 2026" to "Aug – Sep 2026" — must not
  // cost sixty cell renders. This is the fling case, and it is why `onPickDay`
  // is one stable function rather than an arrow per cell.
  view.rerender(tree);

  expect(renders.get(HEAVY.label) ?? 0).toBe(before);
});

it("keeps a flat day neutral — money moved and none of it left", () => {
  // A day of transfers between your own accounts nets to zero. Colouring it
  // either way would be a claim about direction the day does not make, and
  // marking it "nothing" would hide that anything happened at all.
  const flat: RibbonDay = {
    date: "2026-08-16",
    day: 16,
    weekday: "S",
    activity: "some",
    direction: "flat",
    label: "Saturday 16 August, moved between your accounts, 2 entries",
  };
  draw({ days: [flat], current: "2026-08-16" });
  expect(screen.getByRole("button", { name: /moved between your accounts/ })).toBeTruthy();
});

/**
 * **The strip runs earliest-first, so the day the list is on is often the far
 * right of it** — and on a cold open that day is today, which is the whole
 * right-hand end. A strip that reports where the list is, scrolled to a week
 * the reader did not ask about, reports nothing.
 *
 * The arithmetic, not the scroll: `onLayout` is a `ResizeObserver` here and
 * never fires, so the effect that uses this cannot run under jsdom. `visual/`
 * carries the rendered half, in a browser that has layout.
 */
describe("scrolling the current day into view", () => {
  const BAND = 358;

  it("centres the cell on the day the list is on", () => {
    // Measured in Chrome: cell 0 sits at 16 — the track's own leading padding —
    // and the stride is 52. So cell 10's middle is 16 + 520 + 24 = 560, and a
    // 358pt band centred on it starts at 381. Without the 16 every cell lands
    // a padding to the left of the middle.
    expect(offsetFor(10, BAND)).toBe(381);
  });

  it("does not scroll off the near end for a cell already in view", () => {
    // A negative offset is an overscroll the reader never asked for, and on the
    // web it is simply ignored — which would leave the strip wherever it was.
    expect(offsetFor(0, BAND)).toBe(0);
    expect(offsetFor(2, BAND)).toBe(0);
  });

  it("stays put while the list is between days, or before a first layout", () => {
    // `current: null` is a list mid-fling; a strip that jumped then would be
    // moving its own mark while the reader scrolled.
    expect(offsetFor(-1, BAND)).toBeNull();
    expect(offsetFor(10, 0)).toBeNull();
  });
});

/**
 * **The anchor usually has no cell of its own**, because the strip spans the
 * days the list *loaded rows for* and a day you recorded nothing on is not one
 * of them — today included, on any day you have not captured yet. An exact
 * match alone left the strip at offset zero, which after the earliest-first
 * sort means its oldest day, while the list sits at its newest.
 */
describe("which cell stands for the day the list is on", () => {
  const strip = [{ date: "2026-08-10" }, { date: "2026-08-11" }, { date: "2026-08-14" }];

  it("takes the cell itself when the strip holds it", () => {
    expect(cellFor(strip, "2026-08-11")).toBe(1);
  });

  it("falls back to the nearest day below it, which is where the list scrolls", () => {
    // The 12th and 13th hold nothing, so the strip has no cell for either.
    expect(cellFor(strip, "2026-08-13")).toBe(1);
    // A cold open on a day nothing is recorded on: the newest loaded day.
    expect(cellFor(strip, "2026-09-01")).toBe(2);
  });

  it("takes the first cell when every day it holds is later", () => {
    // A jump forward past the newest row: the first cell is as near as the
    // strip gets to where the list is.
    expect(cellFor(strip, "2026-01-01")).toBe(0);
  });

  it("stands for nothing while the list is between days, or holds no days", () => {
    expect(cellFor(strip, null)).toBe(-1);
    expect(cellFor([], "2026-08-11")).toBe(-1);
  });
});
