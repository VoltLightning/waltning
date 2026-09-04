/**
 * `TransactionHero` — S09's anchor figure, the first thing the detail screen
 * resolves (§6: "the amount resolves first"). Three stories cover the three
 * colours `<Amount>`'s `kind` can carry here: spend, income, and a transfer
 * leg, which is neither.
 */

import type { Meta, StoryObj } from "@storybook/react-native-web-vite";
import { toMoney } from "@waltning/core/money";
import { TransactionHero } from "./transaction-hero";

const meta = {
  title: "Transactions/TransactionHero",
  component: TransactionHero,
  args: {
    amount: toMoney("-48.90"),
    currency: "PLN",
    type: "expense",
    accountName: "Cash",
  },
} satisfies Meta<typeof TransactionHero>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Expense: Story = {};

export const Income: Story = {
  args: { amount: toMoney("2000.00"), type: "income", accountName: "Bank A · PLN" },
};

/** Two legs of one transfer are signed opposite ways and neither is a gain or a loss. */
export const Transfer: Story = {
  args: { amount: toMoney("100.00"), type: "transfer", accountName: "Savings" },
};
