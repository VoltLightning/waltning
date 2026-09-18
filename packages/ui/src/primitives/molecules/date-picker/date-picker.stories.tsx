/**
 * `DatePicker` — §3.7a's sheet: the four days a ledger entry usually means,
 * over the drum for everything else.
 *
 * Every story opens the modal, because that is the only state this component
 * has. `February` is the one worth reading twice: its day column stops at 28,
 * which is the rule that keeps a date the schema would refuse from ever being
 * offered.
 */

import type { Meta, StoryObj } from "@storybook/react-native-web-vite";
import { accountingDate } from "@waltning/core/date";
import { DatePicker } from "./date-picker";

function noop() {}

const TODAY = accountingDate("2026-09-18");

const meta = {
  title: "Primitives/DatePicker",
  component: DatePicker,
  args: {
    prompt: "When did this happen?",
    value: TODAY,
    onChange: noop,
    today: TODAY,
    onDismiss: noop,
  },
} satisfies Meta<typeof DatePicker>;

export default meta;
type Story = StoryObj<typeof meta>;

/** Opens on today, with the first chip lit. */
export const Today: Story = {};

/** A chip's day — the light moves, and the drum is already there. */
export const Yesterday: Story = { args: { value: accountingDate("2026-09-17") } };

/** A date no chip names: the drum is the only thing saying what is selected. */
export const AnOlderDate: Story = { args: { value: accountingDate("2026-03-04") } };

/** 28 days offered, and no 29th to land on. */
export const February: Story = { args: { value: accountingDate("2026-02-10") } };

/** The 29th exists here, and only here. */
export const LeapFebruary: Story = { args: { value: accountingDate("2024-02-10") } };
