import type { Meta, StoryObj } from "@storybook/react-native-web-vite";
import * as money from "@waltning/core/money";
import { SpendByCategoryWidget } from "./spend-by-category-widget";

const meta = {
  title: "Dashboard/SpendByCategoryWidget",
  component: SpendByCategoryWidget,
  args: {
    title: "Spend by category",
    meta: "August 2026 · Mine",
    emptyLabel: "Nothing spent this period",
    segments: [
      {
        key: "groceries",
        label: "Groceries",
        amount: money.toMoney("620.00"),
        currency: "PLN",
        decimals: 2,
      },
      {
        key: "dining",
        label: "Dining",
        amount: money.toMoney("410.00"),
        currency: "PLN",
        decimals: 2,
      },
      {
        key: "transport",
        label: "Transport",
        amount: money.toMoney("280.00"),
        currency: "PLN",
        decimals: 2,
      },
      {
        key: "utilities",
        label: "Utilities",
        amount: money.toMoney("190.00"),
        currency: "PLN",
        decimals: 2,
      },
      { key: "home", label: "Home", amount: money.toMoney("150.00"), currency: "PLN", decimals: 2 },
      {
        key: "other",
        label: "Other",
        amount: money.toMoney("95.00"),
        currency: "PLN",
        decimals: 2,
      },
    ],
  },
} satisfies Meta<typeof SpendByCategoryWidget>;

export default meta;
type Story = StoryObj<typeof meta>;

/** Five named categories plus the sixth-and-on folded into "Other" — §7.2. */
export const Populated: Story = {};

export const Empty: Story = {
  args: { segments: [] },
};
