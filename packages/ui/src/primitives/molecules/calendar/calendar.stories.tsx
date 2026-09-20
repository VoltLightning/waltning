/**
 * `Calendar` — §3.7a's desk affordance: the month grid the web has taught
 * everyone to expect, anchored to the field it sets.
 *
 * The stories fix an anchor rather than measuring one, so the panel lands in
 * the same place every run. `February` and `LeapFebruary` are the pair worth
 * reading: the grid is six rows in both, and only one of them has a 29th.
 */

import type { Meta, StoryObj } from "@storybook/react-native-web-vite";
import { accountingDate } from "@waltning/core/date";
import { Calendar } from "./calendar";

function noop() {}

const TODAY = accountingDate("2026-09-18");

/** A field's measured box — 320 wide, a third of the way down the frame. */
const ANCHOR = { x: 24, y: 240, width: 320, height: 44 };

const meta = {
  title: "Primitives/Calendar",
  component: Calendar,
  args: {
    label: "Date",
    value: TODAY,
    onChange: noop,
    today: TODAY,
    anchor: ANCHOR,
    onDismiss: noop,
  },
} satisfies Meta<typeof Calendar>;

export default meta;
type Story = StoryObj<typeof meta>;

/** Today, selected and marked at once. */
export const Today: Story = {};

/** A day that is not today — the mark stays where today is. */
export const AnotherDay: Story = { args: { value: accountingDate("2026-09-03") } };

/** Paged away from today entirely: the mark is off this grid. */
export const AnotherMonth: Story = { args: { value: accountingDate("2026-03-04") } };

/** Four lead days and a two-row tail — 28 of its own. */
export const February: Story = { args: { value: accountingDate("2026-02-10") } };

/** The 29th exists here, and only here. */
export const LeapFebruary: Story = { args: { value: accountingDate("2024-02-10") } };

/** A month that starts on the week's first day — no lead at all. */
export const NoLead: Story = { args: { value: accountingDate("2026-06-15") } };
