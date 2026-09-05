import type { Meta, StoryObj } from "@storybook/react-native-web-vite";
import * as money from "@waltning/core/money";
import { IncomeVsExpenseWidget } from "./income-vs-expense-widget";

const meta = {
  title: "Dashboard/IncomeVsExpenseWidget",
  component: IncomeVsExpenseWidget,
  args: {
    title: "Income vs expense",
    meta: "Last 3 months · Mine",
    incomeLabel: "Income",
    expenseLabel: "Expense",
    emptyLabel: "Nothing to show for this range",
    bars: [
      {
        label: "2026-06",
        income: money.toMoney("6500"),
        expense: money.toMoney("4200"),
        currency: "PLN",
        decimals: 2,
      },
      {
        label: "2026-07",
        income: money.toMoney("6500"),
        expense: money.toMoney("5100"),
        currency: "PLN",
        decimals: 2,
      },
      {
        label: "2026-08",
        income: money.toMoney("6800"),
        expense: money.toMoney("3900"),
        currency: "PLN",
        decimals: 2,
      },
    ],
  },
} satisfies Meta<typeof IncomeVsExpenseWidget>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Populated: Story = {};

export const Empty: Story = {
  args: { bars: [] },
};
