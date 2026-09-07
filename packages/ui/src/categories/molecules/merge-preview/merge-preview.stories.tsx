/**
 * `MergePreview` — `screens/S19-settings-categories.md` §7. "Merge is the
 * screen that matters" — this states the count before the write.
 */

import type { Meta, StoryObj } from "@storybook/react-native-web-vite";
import { MergePreview } from "./merge-preview";

const meta = {
  title: "Categories/MergePreview",
  component: MergePreview,
  args: {
    loserName: "Eating out",
    winnerName: "Groceries",
    counts: { transactions: 12, lines: 3, rules: 1 },
  },
} satisfies Meta<typeof MergePreview>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};

export const Empty: Story = {
  args: { counts: { transactions: 0, lines: 0, rules: 0 } },
};
