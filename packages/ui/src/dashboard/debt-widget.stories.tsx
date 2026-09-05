import type { Meta, StoryObj } from "@storybook/react-native-web-vite";
import * as money from "@waltning/core/money";
import { DebtWidget } from "./debt-widget";

const meta = {
  title: "Dashboard/DebtWidget",
  component: DebtWidget,
  args: {
    title: "Debt",
    currency: null,
    period: "As of September 5, 2026",
    scope: "All",
    theyOweLabel: "they owe you",
    youOweLabel: "you owe",
    emptyLabel: "Nobody owes, and you owe nobody",
    totals: [
      {
        currency: money.currencyCode("PLN"),
        decimals: 2,
        theyOwe: money.toMoney("840.00"),
        youOwe: money.toMoney("120.00"),
      },
    ],
  },
} satisfies Meta<typeof DebtWidget>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Populated: Story = {};

export const Empty: Story = {
  args: { totals: [] },
};
