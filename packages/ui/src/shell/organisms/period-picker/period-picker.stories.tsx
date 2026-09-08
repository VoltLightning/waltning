/**
 * What `PagerHeader`'s title opens. The title was routed to the Months page
 * first, and rendered that read as a bug — tapping *September* collapsed the
 * header and left a year on screen with nothing to choose from.
 */

import type { Meta, StoryObj } from "@storybook/react-native-web-vite";
import type { YearMonth } from "@waltning/core/date";
import { PeriodPicker } from "./period-picker";

function noop() {}

const meta = {
  title: "Shell/PeriodPicker",
  component: PeriodPicker,
  args: {
    visible: true,
    year: 2026,
    current: "2026-09" as YearMonth,
    horizon: "2026-09" as YearMonth,
    onYearChange: noop,
    onPick: noop,
    onDismiss: noop,
  },
  parameters: { layout: "fullscreen" },
} satisfies Meta<typeof PeriodPicker>;

export default meta;
type Story = StoryObj<typeof meta>;

/** This year: the months past the horizon are offered as disabled (S04 §6). */
export const ThisYear: Story = {};

/** A year already lived through — every month is reachable. */
export const APastYear: Story = {
  args: { year: 2024, current: "2024-03" as YearMonth },
};

/**
 * **A year the pager is not in.** Stepping the sheet's year is looking, not
 * choosing, so nothing is marked until a month in it is picked.
 */
export const LookingElsewhere: Story = {
  args: { year: 2025 },
};
