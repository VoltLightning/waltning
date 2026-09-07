/**
 * `PeriodField` — S10 §4's range, as the periods people filter by rather than
 * as two endpoints. The two date fields it replaces are still here, one tap
 * away, for a range none of the four names.
 */

import type { Meta, StoryObj } from "@storybook/react-native-web-vite";
import { accountingDate } from "@waltning/core/date";
import { PeriodField } from "./period-field";

function noop() {}

const TODAY = accountingDate("2026-09-03");

const meta = {
  title: "Transactions/PeriodField",
  component: PeriodField,
  args: { from: "", to: "", today: TODAY, onChange: noop },
} satisfies Meta<typeof PeriodField>;

export default meta;
type Story = StoryObj<typeof meta>;

/** Nothing set — "Any time" is the period, and it is a period like the others. */
export const AnyTime: Story = {};

/** The month a person is in, which is the one most filters want. */
export const ThisMonth: Story = {
  args: { from: "2026-09-01", to: "2026-09-30" },
};

/** A rolling window, which no calendar month names. */
export const Last30: Story = {
  args: { from: "2026-08-05", to: "2026-09-03" },
};

/**
 * A range no period names — the two fields open themselves, because a filter
 * that hid the dates it was filtering by would be lying about the list.
 */
export const ExactDates: Story = {
  args: { from: "2026-08-14", to: "2026-09-02" },
};
