/** @vitest-environment jsdom */

import { render, screen } from "@testing-library/react";
import { beforeEach, expect, it, vi } from "vitest";
import { ThemeProvider } from "../../../theme/provider";
import { light } from "../../../theme/roles.ts";
import { DayRibbon, type RibbonDay } from "./day-ribbon";

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
