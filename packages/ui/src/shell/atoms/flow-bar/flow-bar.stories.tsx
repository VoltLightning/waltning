/**
 * The month's arithmetic as a shape (S04 §3) — the track is what came in, the
 * fill is what went out, and the gap that remains is what you kept.
 */

import type { Meta, StoryObj } from "@storybook/react-native-web-vite";
import * as money from "@waltning/core/money";
import { FlowBar } from "./flow-bar";

const meta = {
  title: "Shell/FlowBar",
  component: FlowBar,
  args: { inflow: money.toMoney("7850.00"), spend: money.toMoney("4320.18") },
} satisfies Meta<typeof FlowBar>;

export default meta;
type Story = StoryObj<typeof meta>;

/** A month that kept something: the gap on the right is what is left. */
export const Kept: Story = {};

/**
 * **A deficit fills the track and stops.** The fill never overruns, because a
 * bar longer than its own container is a graphic that has to be explained. The
 * figures beside it carry the overshoot, which is what figures are for.
 */
export const Overspent: Story = {
  args: { inflow: money.toMoney("7850.00"), spend: money.toMoney("9200.00") },
};

/** Almost all of it spent — the shape the figures state in words. */
export const NearlyAll: Story = {
  args: { inflow: money.toMoney("7850.00"), spend: money.toMoney("7600.00") },
};

/**
 * **A month with nothing in it draws an empty track, not a full one.** Zero
 * arrived and zero left; a bar filled by `0 / 0` would say the month was
 * entirely spent, and one painted green would call an absence a success.
 */
export const Nothing: Story = { args: { inflow: money.ZERO, spend: money.ZERO } };
