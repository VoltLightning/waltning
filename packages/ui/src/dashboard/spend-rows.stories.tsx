/**
 * The same §6 data `SpendByCategoryWidget` draws as one stacked bar, as a row
 * per category. The screenshots are where the choice is judged: a phone reader
 * comparing categories reads down a column, and a legend beside a bar makes
 * them read across.
 */

import type { Meta, StoryObj } from "@storybook/react-native-web-vite";
import * as money from "@waltning/core/money";
import { SpendRows } from "./spend-rows";

const meta = {
  title: "Dashboard/SpendRows",
  component: SpendRows,
  args: { currency: "PLN" },
} satisfies Meta<typeof SpendRows>;

export default meta;
type Story = StoryObj<typeof meta>;

/** Four categories, ranked. Bars scale to the largest row, not to the total. */
export const Ranked: Story = {
  args: {
    rows: [
      { key: "groceries", label: "Groceries", amount: money.toMoney("1240.50") },
      { key: "home", label: "Home", amount: money.toMoney("980.00") },
      { key: "transport", label: "Transport", amount: money.toMoney("610.40") },
      { key: "fun", label: "Fun", amount: money.toMoney("489.28") },
    ],
  },
};

/**
 * **One category takes almost everything.** The rows below it are still
 * distinguishable from each other, which scaling to the total would have
 * flattened into four near-empty tracks.
 */
export const OneDominant: Story = {
  args: {
    rows: [
      { key: "rent", label: "Home", amount: money.toMoney("4200.00") },
      { key: "groceries", label: "Groceries", amount: money.toMoney("310.00") },
      { key: "transport", label: "Transport", amount: money.toMoney("88.40") },
    ],
  },
};

/**
 * The tail folded, and the blank kept apart from it. *Uncategorized* is money
 * a person can act on; *Other* is the rows that ran off the end.
 */
export const FoldedTail: Story = {
  args: {
    rows: [
      { key: "groceries", label: "Groceries", amount: money.toMoney("1240.50") },
      { key: "home", label: "Home", amount: money.toMoney("980.00") },
      { key: "transport", label: "Transport", amount: money.toMoney("610.40") },
      { key: "fun", label: "Fun", amount: money.toMoney("489.28") },
      { key: "health", label: "Health", amount: money.toMoney("212.00") },
      { key: "uncategorized", label: "Uncategorized", amount: money.toMoney("140.00") },
      { key: "other", label: "Other", amount: money.toMoney("96.20") },
    ],
  },
};

/**
 * **A negative bucket draws no bar and still states its figure.** A legal
 * split can carry a discount line, so this is reachable; renormalising the
 * others against a total that included it would inflate every one of them.
 */
export const NegativeBucket: Story = {
  args: {
    rows: [
      { key: "groceries", label: "Groceries", amount: money.toMoney("1240.50") },
      { key: "refunds", label: "Refunds", amount: money.toMoney("-80.00") },
    ],
  },
};

/** A long category name truncates rather than pushing the figure off the row. */
export const LongLabel: Story = {
  args: {
    rows: [
      { key: "a", label: "Household maintenance", amount: money.toMoney("1240.50") },
      { key: "b", label: "Fun", amount: money.toMoney("310.00") },
    ],
  },
};
