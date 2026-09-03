/**
 * `Banner` — `design-system/05` §5.4. The three tones together, so `warn`
 * reads as the only amber use in the system rather than a generic highlight.
 */

import type { Meta, StoryObj } from "@storybook/react-native-web-vite";
import { Banner } from "./banner";

function noop() {}

const meta = {
  title: "States/Banner",
  component: Banner,
  args: { tone: "neutral", message: "Showing data as of 14:06" },
} satisfies Meta<typeof Banner>;

export default meta;
type Story = StoryObj<typeof meta>;

/** Offline, stated as freshness rather than failure (§8.3). */
export const Neutral: Story = {};

/** Not finished or not fully observed — P4's one amber use. */
export const Warn: Story = {
  args: {
    tone: "warn",
    message: "Rates are 3 days old",
    action: { label: "Refresh", onPress: noop },
  },
};

/** A failure. */
export const Negative: Story = {
  args: {
    tone: "negative",
    message: "The last sync failed",
    action: { label: "Retry", onPress: noop },
  },
};
