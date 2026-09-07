/**
 * `ConfirmDialog` — `design-system/05` §5. Genuinely destructive and
 * irreversible only. S19's merge is the motivating case: J12 says plainly it
 * is not reversible in one step, and this states that before the write, not
 * after.
 */

import type { Meta, StoryObj } from "@storybook/react-native-web-vite";
import { ConfirmDialog } from "./confirm-dialog";

function noop() {}

const meta = {
  title: "Shell/ConfirmDialog",
  component: ConfirmDialog,
  args: {
    visible: true,
    title: "This can't be undone in one step",
    body: 'Every transaction, line and rule on "Eating out" moves to "Groceries", and "Eating out" is archived.',
    confirmLabel: "Merge",
    onConfirm: noop,
    onCancel: noop,
  },
} satisfies Meta<typeof ConfirmDialog>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};
