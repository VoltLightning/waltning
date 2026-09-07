/**
 * `CategoryActionsSheet` — `screens/S19-settings-categories.md` §3, §4.
 */

import type { Meta, StoryObj } from "@storybook/react-native-web-vite";
import { CategoryActionsSheet } from "./category-actions-sheet";

function noop() {}

const meta = {
  title: "Categories/CategoryActionsSheet",
  component: CategoryActionsSheet,
  args: {
    visible: true,
    category: { id: "groceries", name: "Groceries", isLeaf: true },
    onRename: noop,
    onMove: noop,
    onConvert: noop,
    onMerge: noop,
    onArchive: noop,
    onDismiss: noop,
  },
} satisfies Meta<typeof CategoryActionsSheet>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Leaf: Story = {};

/** `TAXONOMY.md` R1/R2 — no Move, no Merge; a group converts to a leaf instead. */
export const Group: Story = {
  args: { category: { id: "food", name: "Food", isLeaf: false } },
};

/** Archiving a group with unarchived children refuses — the sheet's own title names the group the error refuses. */
export const Refused: Story = {
  args: {
    category: { id: "food", name: "Food", isLeaf: false },
    error: '"Food" has 2 unarchived categories inside it',
  },
};
