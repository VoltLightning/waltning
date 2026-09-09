/**
 * S04's Calendar page (§3). Each story is a month with a different shape,
 * because the grid's whole job is to make that shape legible in one look.
 *
 * **The marks are `DayCell`'s three channels** — size for how much moved,
 * colour for which way, and a ring against a fill so the direction survives
 * without colour. Red and green are the one pair a colourblind reader cannot
 * separate, so the third channel is what makes the second legal.
 */

import type { Meta, StoryObj } from "@storybook/react-native-web-vite";
import type { GridWeek } from "./month-grid";
import { MonthGrid } from "./month-grid";

function noop() {}
function labelFor(date: string) {
  return date;
}

const HEADINGS = ["S", "M", "T", "W", "T", "F", "S"].map((label, index) => ({
  key: `2026-03-0${index + 1}`,
  label,
}));

type Day = Exclude<GridWeek[number], { blank: true; date: string }>;

/** A day, written the way the model hands one over. */
function day(
  date: string,
  activity: Day["activity"],
  direction: Day["direction"],
  ahead = false,
): Day {
  return { date, day: Number(date.slice(8)), activity, direction, ahead };
}

function blank(date: string) {
  return { blank: true as const, date };
}

/** September 2026: starts on a Tuesday, thirty days, Sunday-first columns. */
const SEPTEMBER: readonly GridWeek[] = [
  [
    blank("2026-08-30"),
    blank("2026-08-31"),
    day("2026-09-01", "some", "out"),
    day("2026-09-02", "none", "flat"),
    day("2026-09-03", "heavy", "out"),
    day("2026-09-04", "some", "out"),
    day("2026-09-05", "none", "flat"),
  ],
  [
    day("2026-09-06", "some", "out"),
    day("2026-09-07", "none", "flat"),
    day("2026-09-08", "some", "out"),
    day("2026-09-09", "heavy", "in"),
    day("2026-09-10", "none", "flat", true),
    day("2026-09-11", "none", "flat", true),
    day("2026-09-12", "none", "flat", true),
  ],
  [
    day("2026-09-13", "none", "flat", true),
    day("2026-09-14", "none", "flat", true),
    day("2026-09-15", "none", "flat", true),
    day("2026-09-16", "none", "flat", true),
    day("2026-09-17", "none", "flat", true),
    day("2026-09-18", "none", "flat", true),
    day("2026-09-19", "none", "flat", true),
  ],
  [
    day("2026-09-20", "none", "flat", true),
    day("2026-09-21", "none", "flat", true),
    day("2026-09-22", "none", "flat", true),
    day("2026-09-23", "none", "flat", true),
    day("2026-09-24", "none", "flat", true),
    day("2026-09-25", "none", "flat", true),
    day("2026-09-26", "none", "flat", true),
  ],
  [
    day("2026-09-27", "none", "flat", true),
    day("2026-09-28", "none", "flat", true),
    day("2026-09-29", "none", "flat", true),
    day("2026-09-30", "none", "flat", true),
    blank("2026-10-01"),
    blank("2026-10-02"),
    blank("2026-10-03"),
  ],
];

const meta = {
  title: "Transactions/MonthGrid",
  component: MonthGrid,
  args: {
    weeks: SEPTEMBER,
    headings: HEADINGS,
    current: "2026-09-08",
    today: "2026-09-09",
    labelFor,
    onPickDay: noop,
  },
} satisfies Meta<typeof MonthGrid>;

export default meta;
type Story = StoryObj<typeof meta>;

/**
 * A month part-way through. Today is filled, the day the pager is on is
 * tinted, the days still ahead are quieter, and a heavy day either way is
 * larger than an ordinary one.
 */
export const PartWayThrough: Story = {};

/**
 * **A month before the ledger existed.** Every day is drawn and none is
 * marked: the grid's shape must not change with its contents, or a reader
 * cannot tell an empty month from a short one.
 */
export const Nothing: Story = {
  args: {
    weeks: SEPTEMBER.map((week) =>
      week.map((cell) =>
        "blank" in cell ? cell : { ...cell, activity: "none" as const, direction: "flat" as const },
      ),
    ),
  },
};

/**
 * **Today outside the month on screen.** Stepping back a month leaves nothing
 * filled — today is a fact about the device, not about the page.
 */
export const AnotherMonth: Story = {
  args: { today: "2026-11-02", current: "2026-09-03" },
};
