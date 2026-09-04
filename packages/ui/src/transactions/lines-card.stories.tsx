/**
 * `LinesCard` — S09's optional breakdown (§10.3). `Balanced` and
 * `Unbalanced` are the same two lines against a total that does and does not
 * sum, `Empty` is the state every transaction starts in, and `Mismatch` is
 * the refusal `set_transaction_lines` throws, surfaced.
 */

import type { Meta, StoryObj } from "@storybook/react-native-web-vite";
import { toMoney } from "@waltning/core/money";
import { LinesCard } from "./lines-card";

function noop() {}

const LINES = [
  {
    id: "11111111-1111-4111-8111-111111111111",
    description: "Groceries",
    amount: toMoney("42.10"),
    categoryId: null,
    categoryName: null,
  },
  {
    id: "22222222-2222-4222-8222-222222222222",
    description: "Household supplies",
    amount: toMoney("6.80"),
    categoryId: "cat-household",
    categoryName: "Household",
  },
];

const meta = {
  title: "Transactions/LinesCard",
  component: LinesCard,
  args: {
    lines: LINES,
    total: toMoney("48.90"),
    currency: "PLN",
    onSave: noop,
  },
} satisfies Meta<typeof LinesCard>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Balanced: Story = {};

export const Unbalanced: Story = {
  args: { total: toMoney("100.00") },
};

export const Empty: Story = {
  args: { lines: [] },
};

export const Mismatch: Story = {
  args: {
    fieldErrors: {
      byField: {},
      formLevel: ["set_transaction_lines: lines sum to 48.90, the transaction is 50.00"],
    },
  },
};
