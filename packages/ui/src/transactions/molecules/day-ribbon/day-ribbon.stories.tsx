/**
 * The strip above S04's List page (§3, §7) — where the list is, and what the
 * days either side of it held.
 *
 * **The mark is three channels, and none of them is hue alone.** Size is how
 * much moved, colour is which way it went, and a ring against a fill says the
 * direction again without colour. Red and green are the one pair a colourblind
 * reader cannot separate, so the third channel is what makes the second legal.
 */

import type { Meta, StoryObj } from "@storybook/react-native-web-vite";
import type { RibbonDay } from "./day-ribbon";
import { DayRibbon } from "./day-ribbon";

function noop() {}

const LETTERS = ["S", "M", "T", "W", "T", "F", "S"];

/** One day, written the way `ribbonDays` hands one over. */
function day(
  date: string,
  activity: RibbonDay["activity"],
  direction: NonNullable<RibbonDay["direction"]>,
  extra: { today?: boolean; ahead?: boolean } = {},
): RibbonDay {
  return {
    date,
    day: Number(date.slice(8)),
    weekday: LETTERS[new Date(`${date}T00:00:00Z`).getUTCDay()] ?? "",
    activity,
    direction,
    label: `${date}, ${activity === "none" ? "nothing" : "2 entries"}`,
    today: extra.today === true,
    ahead: extra.ahead === true,
  };
}

const WEEK: readonly RibbonDay[] = [
  day("2026-09-03", "some", "out"),
  day("2026-09-04", "heavy", "out"),
  day("2026-09-05", "none", "flat"),
  day("2026-09-06", "some", "in"),
  day("2026-09-07", "some", "flat"),
  day("2026-09-08", "some", "out"),
  day("2026-09-09", "heavy", "in", { today: true }),
  day("2026-09-10", "none", "flat", { ahead: true }),
  day("2026-09-11", "none", "flat", { ahead: true }),
];

const meta = {
  title: "Transactions/DayRibbon",
  component: DayRibbon,
  args: { days: WEEK, current: "2026-09-08", onPickDay: noop },
} satisfies Meta<typeof DayRibbon>;

export default meta;
type Story = StoryObj<typeof meta>;

/**
 * A week around today. The 9th is today and filled; the 8th is where the list
 * is and tinted; the 4th and the 9th were heavy either way; the 7th is `flat`
 * — money moved and none of it left, which is a day of transfers between your
 * own accounts and is neither colour.
 */
export const AroundToday: Story = {};

/**
 * **Between days.** A list mid-fling is not on any one day, so nothing is
 * tinted — a strip that guessed would move its own mark while the reader
 * scrolled.
 */
export const BetweenDays: Story = { args: { current: null } };

/**
 * A week the ledger has nothing for. Every day is drawn and none is marked:
 * the strip's shape must not change with its contents.
 */
export const Quiet: Story = {
  args: {
    days: WEEK.map((entry) => ({
      ...entry,
      activity: "none" as const,
      direction: "flat" as const,
    })),
  },
};
