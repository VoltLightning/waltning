/**
 * S04's header, in the two shapes the scroll moves between.
 *
 * **Both are drawn from a fixed offset, not from a gesture**, because a story
 * cannot flick a page. The pair is the evidence for the one claim the change
 * makes visually — that the month is the same month either side of the
 * handover, moving only in size.
 */

import type { Meta, StoryObj } from "@storybook/react-native-web-vite";
import type { SharedValue } from "react-native-reanimated";
import { COLLAPSE_TRAVEL } from "./collapse.ts";
import { PagerHeader } from "./pager-header";

function noop() {}

/** A shared value at a fixed offset — what a story can hold that a finger holds live. */
function at(offset: number): SharedValue<number> {
  return { value: offset } as SharedValue<number>;
}

const meta = {
  title: "Shell/PagerHeader",
  component: PagerHeader,
  args: {
    label: "September",
    detail: "2026",
    onPickPeriod: noop,
    onPrevious: noop,
    onNext: noop,
    onSearch: noop,
    labels: {
      previous: "Previous month",
      next: "Next month",
      search: "Search",
      pickPeriod: "Choose a month",
    },
  },
} satisfies Meta<typeof PagerHeader>;

export default meta;
type Story = StoryObj<typeof meta>;

/** At the top: the month is a large title, and the title is the picker. */
export const AtRest: Story = { args: { scrollY: at(0) } };

/**
 * Scrolled: one row, and the stepper has arrived. The arrows appear with the
 * reason for them — while the month's own summary is on screen, stepping is
 * not what the header is for.
 */
export const Scrolled: Story = { args: { scrollY: at(COLLAPSE_TRAVEL) } };

/**
 * **Mid-travel, which is where the header used to be blank.**
 *
 * Two stacked layouts cross-faded met at zero here: at exactly this offset
 * neither was drawn, and either side of it the month sat under half lit. The
 * baseline is worth having precisely because both ends of a transition can look
 * right while the middle of it is empty — a story at rest and a story scrolled
 * would both have passed the whole time the bar was flickering.
 *
 * It is also where the year is: past the month's edge, not yet up on its row.
 */
export const MidTravel: Story = { args: { scrollY: at(COLLAPSE_TRAVEL / 2) } };

/**
 * **Months, where the year is the period.** `2026` under `2026` is the year
 * twice, so the caption is dropped rather than repeated.
 */
export const NoCaption: Story = {
  args: {
    scrollY: at(0),
    label: "2026",
    detail: null,
    labels: {
      previous: "Previous year",
      next: "Next year",
      search: "Search",
      pickPeriod: "Choose a year",
    },
  },
};

/**
 * **The forward horizon.** S04 §6 stops at the end of the month, so the
 * arrow is disabled rather than removed — a control that vanishes at the edge
 * moves everything beside it, and a disabled one says the edge is there.
 */
export const AtTheHorizon: Story = {
  // `undefined` is the absence, and under `exactOptionalPropertyTypes` a story
  // cannot spell that in `args` — so the story renders the component itself.
  render: (args) => <PagerHeader {...args} onNext={undefined} />,
  args: { scrollY: at(COLLAPSE_TRAVEL) },
};
