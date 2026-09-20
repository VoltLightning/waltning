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
import { useSharedValue } from "react-native-reanimated";
import type { RibbonDay } from "./day-ribbon";
import { DayRibbon } from "./day-ribbon";

function noop() {}

/**
 * **The strip follows a list, and a story has no list — so it follows a still
 * one.**
 *
 * `at` is the fractional day the ring should be over. A `tops` of one entry
 * and a `marks` of that day is a list that is not going anywhere, which is
 * exactly what a screenshot wants: the strip places itself on the first frame
 * (that placement is a jump, never a move) and then has nothing to follow.
 *
 * This wrapper is what the stories render, so the visual suite sees the
 * component wired the way the List page wires it rather than a version of it
 * with the scrubbing taken out.
 */
function StillRibbon({
  at,
  days,
  current,
}: {
  at: number;
  days: readonly RibbonDay[];
  current: string | null;
}) {
  const scrollY = useSharedValue(0);
  const tops = useSharedValue<readonly number[]>([0]);
  const marks = useSharedValue<readonly number[]>([at]);
  return (
    <DayRibbon
      days={days}
      current={current}
      scrollY={scrollY}
      tops={tops}
      marks={marks}
      onPickDay={noop}
    />
  );
}

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

/**
 * September, continuous — more days than a band can hold, which is the only
 * shape in which *where the strip is scrolled to* is a visible fact.
 */
const LONG_RUN: readonly RibbonDay[] = Array.from({ length: 30 }, (_, at) => {
  const date = `2026-09-${String(at + 1).padStart(2, "0")}`;
  const activity = at % 7 === 3 ? "heavy" : at % 3 === 0 ? "none" : "some";
  return day(date, activity, activity === "none" ? "flat" : at % 5 === 0 ? "in" : "out");
});

const meta = {
  title: "Transactions/DayRibbon",
  component: StillRibbon,
  args: { days: WEEK, current: "2026-09-08", at: 3 },
} satisfies Meta<typeof StillRibbon>;

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
 * **Between days.** Mid-scroll the strip is *between* two cells — the ring is
 * still exactly in the middle of the band, and the run under it is half a cell
 * along. Nothing is tinted, because no day has been settled on yet.
 *
 * The ring never moves and is never absent: it is where the reader is, and a
 * mark that disappeared during the gesture it exists for would be no mark.
 */
export const BetweenDays: Story = { args: { current: null, at: 3.5 } };

/**
 * **A month, placed on the day the list is showing.**
 *
 * The strip runs earliest-first, so over a month of days the one a reader is
 * on is nowhere near the band unless the strip is placed — and placing it is
 * the scroll's job. This is the case jsdom cannot see: `onLayout` never fires
 * there, so `scrub.ts` has the arithmetic under unit test and the placement
 * itself has this.
 */
export const ScrolledToTheDay: Story = {
  args: {
    days: LONG_RUN,
    // Mid-month on purpose: a day near either end clamps against the scroller's
    // own limit, and a clamped strip looks the same whether the offset was
    // computed correctly or not.
    current: "2026-09-15",
    at: 14,
  },
};

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
