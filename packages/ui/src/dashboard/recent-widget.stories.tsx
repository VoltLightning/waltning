import type { Meta, StoryObj } from "@storybook/react-native-web-vite";
import * as money from "@waltning/core/money";
import { fn } from "storybook/test";
import { RecentWidget } from "./recent-widget";

const meta = {
  title: "Dashboard/RecentWidget",
  component: RecentWidget,
  args: {
    title: "Recent",
    currency: "PLN",
    period: "As of September 5, 2026",
    scope: "All",
    emptyLabel: "Nothing recorded yet",
    onPress: fn(),
    rows: [
      {
        id: "t1",
        payee: "Grocer",
        meta: "Groceries",
        amount: money.toMoney("120.00"),
        currency: "PLN",
        decimals: 2,
        kind: "spend",
      },
      {
        id: "t2",
        payee: "Employer",
        meta: "Salary",
        amount: money.toMoney("6500.00"),
        currency: "PLN",
        decimals: 2,
        kind: "income",
      },
      {
        id: "t3",
        payee: "Coffee shop",
        meta: "Dining",
        amount: money.toMoney("18.50"),
        currency: "PLN",
        decimals: 2,
        kind: "spend",
      },
    ],
  },
} satisfies Meta<typeof RecentWidget>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Populated: Story = {};

export const Empty: Story = {
  args: { rows: [] },
};
