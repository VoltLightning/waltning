/**
 * `DateField` — §3.7: defaults to today, relative shortcuts (yesterday).
 */

import type { Meta, StoryObj } from "@storybook/react-native-web-vite";
import { DateField } from "./date-field";

function noop() {}

const TODAY = "2026-08-24";

const meta = {
  title: "Primitives/DateField",
  component: DateField,
  args: { label: "Date", value: TODAY, onChange: noop, today: TODAY },
} satisfies Meta<typeof DateField>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};

/** The shape check passes; the calendar check the field owns does not. */
export const WithError: Story = {
  args: { value: "2026-02-30" },
};

/** A refusal from `create_transaction` itself — the field's own check stands down. */
export const WithFieldError: Story = {
  args: { error: "date: already used by this account's opening balance" },
};
