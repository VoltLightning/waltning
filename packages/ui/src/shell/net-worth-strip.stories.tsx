/**
 * The strip that replaced a 54pt hero. The screenshots are the argument: one
 * line carries the same figure the band spent a third of the screen on, and
 * the states below are the three things it has to say without growing.
 */

import type { Meta, StoryObj } from "@storybook/react-native-web-vite";
import * as money from "@waltning/core/money";
import { NetWorthStrip } from "./net-worth-strip";

function noop() {}

const meta = {
  title: "Shell/NetWorthStrip",
  component: NetWorthStrip,
  args: { currency: "PLN", onPress: noop },
} satisfies Meta<typeof NetWorthStrip>;

export default meta;
type Story = StoryObj<typeof meta>;

/** One currency, no shared account — the common case, and the shortest. */
export const Mine: Story = {
  args: { mine: money.toMoney("48620.84"), ours: null },
};

/**
 * With a shared account the household figure is a second line rather than a
 * second figure: `DualTotal` stacks them because a hero has the room, and this
 * does not.
 */
export const WithShared: Story = {
  args: { mine: money.toMoney("48620.84"), ours: money.toMoney("61240.10") },
};

/**
 * **A total that is one of several says so.** The figure is the lead
 * currency's, and a strip that showed it alone would read as everything —
 * which is exactly how someone comes to trust the wrong number.
 */
export const OtherCurrencies: Story = {
  args: { mine: money.toMoney("48620.84"), ours: null, otherCurrencies: 2 },
};

/** A ledger that holds accounts and no money yet. Zero is a figure, not an empty state. */
export const Zero: Story = {
  args: { mine: money.ZERO, ours: null },
};
