/** `CategorizeSelectionConfirm` — S10 §7 (web): `categorize_batch` behind one confirm. */

import type { Meta, StoryObj } from "@storybook/react-native-web-vite";
import { fn } from "storybook/test";
import { CategorizeSelectionConfirm } from "./categorize-selection-confirm";

const meta = {
  title: "Transactions/CategorizeSelectionConfirm",
  component: CategorizeSelectionConfirm,
  args: {
    count: 24,
    categoryName: "Eating out",
    state: "pending",
    onApprove: fn(),
    onDecline: fn(),
  },
} satisfies Meta<typeof CategorizeSelectionConfirm>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Pending: Story = {};

export const SingleRow: Story = { args: { count: 1 } };

export const Applying: Story = { args: { state: "applying" } };

export const Approved: Story = { args: { state: "approved" } };

/** `transactions_category_shape` — a named row is gone, or not income or expense. */
export const Refused: Story = { args: { state: "error" } };
