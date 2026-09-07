/**
 * `ThinkingIndicator` — `design-system/08` §8.5. Three phases plus the 20 s
 * still-working cancel, so a fifteen-second wait never reads as a hang.
 */

import type { Meta, StoryObj } from "@storybook/react-native-web-vite";
import { ThinkingIndicator } from "./thinking-indicator";

function noop() {}

const meta = {
  title: "States/ThinkingIndicator",
  component: ThinkingIndicator,
  args: { phase: "thinking", elapsedMs: 500, onCancel: noop },
} satisfies Meta<typeof ThinkingIndicator>;

export default meta;
type Story = StoryObj<typeof meta>;

/** No output yet, before the 2 s timer appears. */
export const Thinking: Story = {};

/** Past 2 s — the elapsed timer appears. */
export const ThinkingWithTimer: Story = { args: { elapsedMs: 5_000 } };

/** A tool is running, named. */
export const ToolRunning: Story = {
  args: { phase: "tool", elapsedMs: 1_200, toolLabel: "search_transactions · 1.2 s" },
};

/** Text arriving. */
export const Streaming: Story = {
  args: { phase: "streaming", elapsedMs: 6_000, streamingText: "Found three transactions" },
};

/** Past 20 s — explicit, with a cancel. */
export const StillWorking: Story = { args: { elapsedMs: 22_000 } };
