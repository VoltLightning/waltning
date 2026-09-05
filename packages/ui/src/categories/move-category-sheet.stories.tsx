/**
 * `MoveCategorySheet` — `screens/S19-settings-categories.md` §3, §4.
 * `reparent_category`'s picker, over `Select` per the plan's own fallback.
 */

import type { Meta, StoryObj } from "@storybook/react-native-web-vite";
import { MoveCategorySheet } from "./move-category-sheet";

function noop() {}

const meta = {
  title: "Categories/MoveCategorySheet",
  component: MoveCategorySheet,
  args: {
    visible: true,
    categoryName: "Groceries",
    groups: [
      { id: "food", name: "Food" },
      { id: "household", name: "Household" },
    ],
    onSave: noop,
    onDismiss: noop,
  },
} satisfies Meta<typeof MoveCategorySheet>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};

/** J12 §4 — reparent refused across kinds. */
export const Refused: Story = {
  args: {
    categoryName: "Salary",
    error: '"Food" is an expense group — refused across kinds',
  },
};
