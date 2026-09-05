import type { Meta, StoryObj } from "@storybook/react-native-web-vite";
import * as money from "@waltning/core/money";
import { BalancesWidget } from "./balances-widget";

const meta = {
  title: "Dashboard/BalancesWidget",
  component: BalancesWidget,
  args: {
    title: "Balances",
    meta: "Now · Mine",
    emptyLabel: "No accounts yet",
    rows: [
      {
        id: "a1",
        name: "Bank A · PLN",
        balance: money.toMoney("12480.20"),
        currency: "PLN",
        decimals: 2,
      },
      {
        id: "a2",
        name: "Cash · PLN",
        balance: money.toMoney("340.00"),
        currency: "PLN",
        decimals: 2,
      },
      {
        id: "a3",
        name: "Savings · EUR",
        balance: money.toMoney("2100.00"),
        currency: "EUR",
        decimals: 2,
      },
    ],
  },
} satisfies Meta<typeof BalancesWidget>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Populated: Story = {};

export const Empty: Story = {
  args: { rows: [] },
};

export const Loading: Story = {
  args: { loading: true },
};
