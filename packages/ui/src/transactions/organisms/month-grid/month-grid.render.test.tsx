/**
 * @vitest-environment jsdom
 *
 * **What a parent's re-render costs the grid.**
 *
 * Measured in Chrome first, which is where the number is real: scrolling S04's
 * Summary from the top to 400pt and back re-renders `PagerHeader` exactly twice
 * — once per crossing of the handover — and re-renders the calendar grid and
 * the list zero times. This file is what keeps the second half of that true.
 *
 * **The grid is thirty pressables, so its memoisation is not a micro-
 * optimisation.** The pager keeps all four pages mounted, and S04's screen
 * re-renders on every ledger write, every appearance change and every route
 * param — a grid that redrew on each of those would rebuild thirty cells to
 * produce the same pixels.
 *
 * **The failing case is pinned too.** A test that only shows the good path
 * passes just as happily when the memo is deleted, so the second case proves
 * this one can fail: an inline `onPickDay` is a new function every render, and
 * it defeats `memo` completely.
 */

import { act, render, screen } from "@testing-library/react";
import { useCallback, useState } from "react";
import { Pressable, Text } from "react-native";
import { expect, it, vi } from "vitest";
import { ThemeProvider } from "../../../theme/provider";
import { light } from "../../../theme/roles.ts";
import { type GridWeek, MonthGrid } from "./month-grid";

const WEEKS: readonly GridWeek[] = [
  [
    { blank: true, date: "2026-08-31" },
    { date: "2026-09-01", day: 1, activity: "some", direction: "out", ahead: false },
    { date: "2026-09-02", day: 2, activity: "none", direction: "flat", ahead: false },
    { date: "2026-09-03", day: 3, activity: "heavy", direction: "in", ahead: false },
    { date: "2026-09-04", day: 4, activity: "none", direction: "flat", ahead: true },
    { date: "2026-09-05", day: 5, activity: "none", direction: "flat", ahead: true },
    { date: "2026-09-06", day: 6, activity: "none", direction: "flat", ahead: true },
  ],
];

const HEADINGS = [
  { key: "2026-03-01", label: "S" },
  { key: "2026-03-02", label: "M" },
  { key: "2026-03-03", label: "T" },
  { key: "2026-03-04", label: "W" },
  { key: "2026-03-05", label: "T" },
  { key: "2026-03-06", label: "F" },
  { key: "2026-03-07", label: "S" },
];

const onPickDay = vi.fn();

/**
 * **The grid's own work, counted without instrumenting it.**
 *
 * `MonthGrid` calls `labelFor` once per drawn day on every render, so the
 * number of calls is the number of renders times the days in the week — no
 * counter inside the component, and nothing to remove afterwards.
 */
function Harness({ labelFor, inline }: { labelFor: (date: string) => string; inline: boolean }) {
  const [tick, setTick] = useState(0);
  const bump = useCallback(() => setTick((n) => n + 1), []);
  // The second case's whole subject: a fresh function on every render, which is
  // what a handler written inside a screen's JSX is. Built here rather than in
  // the prop because Biome refuses the inline form outright — the rule this
  // test exists to show the cost of.
  const handler = inline ? (date: string) => onPickDay(date) : onPickDay;
  return (
    <ThemeProvider theme={light}>
      <Pressable accessibilityRole="button" accessibilityLabel="bump" onPress={bump}>
        <Text>{tick}</Text>
      </Pressable>
      <MonthGrid
        weeks={WEEKS}
        headings={HEADINGS}
        current="2026-09-01"
        today="2026-09-01"
        labelFor={labelFor}
        onPickDay={handler}
      />
    </ThemeProvider>
  );
}

it("does no work when its parent re-renders", () => {
  const labelFor = vi.fn((date: string) => date);
  render(<Harness labelFor={labelFor} inline={false} />);
  const drawn = labelFor.mock.calls.length;
  expect(drawn, "the fixture draws six days").toBe(6);

  act(() => {
    screen.getByRole("button", { name: "bump" }).click();
    screen.getByRole("button", { name: "bump" }).click();
  });

  expect(labelFor.mock.calls.length, "the parent re-rendered and the grid followed").toBe(drawn);
});

it("redraws every cell once the handler is created inside the parent", () => {
  // Proof the check above can fail. An inline arrow is a different function on
  // every render, so `memo` compares unequal props and the grid rebuilds every
  // cell to draw the same pixels.
  const labelFor = vi.fn((date: string) => date);
  render(<Harness labelFor={labelFor} inline={true} />);
  const drawn = labelFor.mock.calls.length;

  act(() => {
    screen.getByRole("button", { name: "bump" }).click();
  });

  expect(labelFor.mock.calls.length).toBeGreaterThan(drawn);
});
