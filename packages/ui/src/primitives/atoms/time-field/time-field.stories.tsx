/**
 * `TimeField` — §3.7: a clock time, where something has one. Empty is the
 * normal state, and the field says so.
 */

import type { Meta, StoryObj } from "@storybook/react-native-web-vite";
import { timeOfDay } from "@waltning/core/date";
import { TimeField } from "./time-field";

function noop() {}

const meta = {
  title: "Primitives/TimeField",
  component: TimeField,
  args: { label: "Time", value: "", onChange: noop, now: timeOfDay("14:37") },
} satisfies Meta<typeof TimeField>;

export default meta;
type Story = StoryObj<typeof meta>;

/** No time, which most transactions never have. */
export const Empty: Story = {};

/** A time, and the way to take it back off. */
export const WithATime: Story = { args: { value: "08:12" } };

/** What a hand writes: read as 09:30, so nothing complains. */
export const TypedLoosely: Story = { args: { value: "0930" } };

/** Not a time, and said so rather than rounded into one. */
export const NotATime: Story = { args: { value: "25:00" } };
