/**
 * `MergeCategorySheet` — `screens/S19-settings-categories.md` §7. "Merge is
 * the screen that matters": pick the winner, see the count, confirm.
 */

import type { Meta, StoryObj } from "@storybook/react-native-web-vite";
import { MergeCategorySheet } from "./merge-category-sheet";

function noop() {}

const meta = {
  title: "Categories/MergeCategorySheet",
  component: MergeCategorySheet,
  args: {
    visible: true,
    loserName: "Eating out",
    candidates: [
      { id: "groceries", name: "Groceries" },
      { id: "takeout", name: "Takeout" },
    ],
    counts: { transactions: 12, lines: 3, rules: 1 },
    onConfirm: noop,
    onDismiss: noop,
  },
} satisfies Meta<typeof MergeCategorySheet>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};

export const Refused: Story = {
  args: {
    loserName: "Salary",
    counts: { transactions: 0, lines: 0, rules: 0 },
    error: '"Groceries" is expense, "Salary" is income — refused across kinds',
  },
};
