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
    // What the batch is leaving, and how much of it is not really changing —
    // the round-1 addition. A confirm that stated only the count read the
    // same whether twenty rows were uncategorised or already correct.
    fromCategories: ["Groceries", "Uncategorised", "Leisure"],
    alreadyMatching: 6,
    state: "pending",
    onApprove: fn(),
    onDecline: fn(),
  },
} satisfies Meta<typeof CategorizeSelectionConfirm>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Pending: Story = {};

export const SingleRow: Story = {
  args: { count: 1, fromCategories: ["Uncategorised"], alreadyMatching: 0 },
};

/** Nothing to say about the before — the caller passed no categories at all. */
export const NoOrigin: Story = { args: { fromCategories: [], alreadyMatching: 0 } };

export const Applying: Story = { args: { state: "applying" } };

export const Approved: Story = { args: { state: "approved" } };

/** `transactions_category_shape` — a named row is gone, or not income or expense. */
export const Refused: Story = { args: { state: "error" } };
