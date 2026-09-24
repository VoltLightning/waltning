/**
 * S04's hero. Closed is the screen at rest; the two open stories are its two
 * lenses, and `Shared` is the one place the title is *Mine*.
 */

import type { Meta, StoryObj } from "@storybook/react-native-web-vite";
import * as money from "@waltning/core/money";
import { HoldingsCard, type HoldingsCardProps } from "./holdings-card";

function noop() {}

const BASE: HoldingsCardProps = {
  currency: "PLN",
  decimals: 2,
  mine: money.toMoney("49415.84"),
  ours: null,
  held: money.toMoney("50670.52"),
  owed: money.toMoney("1254.68"),
  counted: 9,
  of: 9,
  byKind: [
    { kind: "bank", count: 3, value: money.toMoney("24310.52") },
    { kind: "cash", count: 1, value: money.toMoney("1820.00") },
    { kind: "card", count: 2, value: money.toMoney("-1254.68") },
    { kind: "investment", count: 1, value: money.toMoney("9640.00") },
    { kind: "deposit", count: 2, value: money.toMoney("14900.00") },
  ],
  byCurrency: [
    {
      currency: "PLN",
      name: "Polish złoty",
      decimals: 2,
      count: 6,
      balance: money.toMoney("32197.60"),
      value: money.toMoney("32197.60"),
    },
    {
      currency: "USD",
      name: "US dollar",
      decimals: 2,
      count: 2,
      balance: money.toMoney("3120.00"),
      value: money.toMoney("12640.40"),
    },
    {
      currency: "EUR",
      name: "Euro",
      decimals: 2,
      count: 1,
      balance: money.toMoney("1050.00"),
      value: money.toMoney("4577.84"),
    },
  ],
  loans: [
    { kind: "loan_receivable", count: 1, value: money.toMoney("3000.00") },
    { kind: "loan_payable", count: 1, value: money.toMoney("-3795.00") },
  ],
  onOpenAccounts: noop,
};

const meta = {
  title: "Accounts/HoldingsCard",
  component: HoldingsCard,
  args: BASE,
} satisfies Meta<typeof HoldingsCard>;

export default meta;
type Story = StoryObj<typeof meta>;

/** At rest: the figure, what is held and owed, and the bar of what it is made of. */
export const Closed: Story = {};

/** Broken down by kind, loans under their own rule and not in the figure. */
export const ByKind: Story = { args: { initiallyOpen: true } };

/** A shared account: the title becomes *Mine*, and *ours* sits under the figure. */
export const Shared: Story = { args: { ours: money.toMoney("61240.10") } };

/** One currency has no rate — the count says the total covers nine of ten. */
export const OneWithoutARate: Story = { args: { of: 10 } };
