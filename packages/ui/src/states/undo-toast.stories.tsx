/**
 * `UndoToast` — `design-system/08` §8.4. The repeat-collapse story is the one
 * the copy names directly: *"3 rows accepted · Undo"* — one toast with a
 * count, never a stack.
 */

import type { Meta, StoryObj } from "@storybook/react-native-web-vite";
import { UndoToast } from "./toast";

function noop() {}

const meta = {
  title: "States/UndoToast",
  component: UndoToast,
  args: { message: "Row deleted", onUndo: noop, onDismiss: noop },
} satisfies Meta<typeof UndoToast>;

export default meta;
type Story = StoryObj<typeof meta>;

/** A single reversible action. */
export const Single: Story = {};

/** Rapid repeats collapse into one toast with a count, never a stack. */
export const RepeatCollapsed: Story = {
  args: { message: "Rows accepted", count: 3 },
};
