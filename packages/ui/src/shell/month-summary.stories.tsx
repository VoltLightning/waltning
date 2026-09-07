/**
 * S04's hero, now that the band has none. Each story is a month with a
 * different answer, because the card's whole job is to make the answer legible
 * in one look.
 */

import type { Meta, StoryObj } from "@storybook/react-native-web-vite";
import * as money from "@waltning/core/money";
import { MonthSummary } from "./month-summary";

function noop() {}

const meta = {
  title: "Shell/MonthSummary",
  component: MonthSummary,
  args: {
    label: "September 2026",
    onPrevious: noop,
    onNext: noop,
    onToday: noop,
    isCurrent: true,
    currency: "PLN",
  },
} satisfies Meta<typeof MonthSummary>;

export default meta;
type Story = StoryObj<typeof meta>;

/** A month that kept something. The `+` is the point — see the component's own note. */
export const Kept: Story = {
  args: {
    spend: money.toMoney("4320.18"),
    inflow: money.toMoney("7850.00"),
    net: money.toMoney("3529.82"),
  },
};

/** A month that spent more than it took. The same three figures, one of them negative. */
export const Overspent: Story = {
  args: {
    spend: money.toMoney("8410.00"),
    inflow: money.toMoney("7850.00"),
    net: money.toMoney("-560.00"),
  },
};

/**
 * A past month — the stepper offers *Today* only when there is somewhere to
 * come back from.
 */
export const PastMonth: Story = {
  args: {
    label: "August 2026",
    isCurrent: false,
    spend: money.toMoney("5120.00"),
    inflow: money.toMoney("7850.00"),
    net: money.toMoney("2730.00"),
  },
};

/**
 * **A month before the ledger existed is three zeroes, not an empty state.**
 * That is the true answer for the period asked about, and an empty state here
 * would claim the screen had nothing while the register below it is full.
 */
export const NothingYet: Story = {
  args: { spend: money.ZERO, inflow: money.ZERO, net: money.ZERO },
};
