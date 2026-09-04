/**
 * `RenameCategorySheet` — `screens/S19-settings-categories.md` §6. Names are
 * not identifiers (J12): renaming propagates and breaks nothing.
 */

import type { Meta, StoryObj } from "@storybook/react-native-web-vite";
import { RenameCategorySheet } from "./rename-category-sheet";

function noop() {}

const meta = {
  title: "Categories/RenameCategorySheet",
  component: RenameCategorySheet,
  args: {
    visible: true,
    categoryName: "Groceries",
    onSave: noop,
    onDismiss: noop,
  },
} satisfies Meta<typeof RenameCategorySheet>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};

/** The sibling-uniqueness refusal (J12 §5), naming the existing sibling. */
export const Refused: Story = {
  args: { categoryName: "groceries", error: '"Groceries" already exists here' },
};
