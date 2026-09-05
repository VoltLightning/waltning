import type { Meta, StoryObj } from "@storybook/react-native-web-vite";
import * as money from "@waltning/core/money";
import { SpendByCategoryWidget } from "./spend-by-category-widget";

const meta = {
  title: "Dashboard/SpendByCategoryWidget",
  component: SpendByCategoryWidget,
  args: {
    title: "Spend by category",
    currency: "PLN",
    period: "August 2026 · by leaf category",
    scope: "Mine",
    emptyLabel: "Nothing spent this period",
    othersLabel: "Other currencies",
    others: [],
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

/**
 * L2 — `transaction_lines` has no positivity CHECK, so a legal split can
 * carry a discount line. The negative segment states its figure in the legend
 * and takes no width at all: giving it a sliver would renormalise every other
 * segment against a total that includes it.
 */
export const WithANegativeSegment: Story = {
  args: {
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
        key: "discount",
        label: "Discount",
        amount: money.toMoney("-90.00"),
        currency: "PLN",
        decimals: 2,
      },
    ],
  },
};

/**
 * A zero segment draws **no** band — the same rule
 * `income-vs-expense-widget.tsx` states for a zero bucket. `Transport` is a
 * category with a `0.00` total, and the bar shows exactly nothing for it;
 * a one-percent floor made it the same mark as a real small category.
 */
export const WithAZeroSegment: Story = {
  args: {
    segments: [
      {
        key: "groceries",
        label: "Groceries",
        amount: money.toMoney("620.00"),
        currency: "PLN",
        decimals: 2,
      },
      {
        key: "transport",
        label: "Transport",
        amount: money.toMoney("0.00"),
        currency: "PLN",
        decimals: 2,
      },
      {
        key: "dining",
        label: "Dining",
        amount: money.toMoney("18.00"),
        currency: "PLN",
        decimals: 2,
      },
    ],
  },
};

/** H1 — a dormant foreign account no longer empties this widget; it gets a row. */
export const WithOtherCurrencies: Story = {
  args: {
    others: [
      {
        currency: "CHF",
        decimals: 2,
        figures: [{ value: money.toMoney("85.00"), kind: "spend" }],
      },
    ],
  },
};

/**
 * H1's own regression, drawn: a PLN-led dashboard with nothing spent in PLN
 * this period still shows what *was* spent, instead of reporting a healthy
 * empty month over a foreign account's activity.
 */
export const OnlyOtherCurrencies: Story = {
  args: {
    segments: [],
    others: [
      {
        currency: "CHF",
        decimals: 2,
        figures: [{ value: money.toMoney("85.00"), kind: "spend" }],
      },
    ],
  },
};
