/**
 * `ActiveFilterChip` — one applied filter in the ledger's bar, removable in
 * place. Its number is how many rows this filter alone leaves out (S10 §4).
 */

import type { Meta, StoryObj } from "@storybook/react-native-web-vite";
import { ActiveFilterChip } from "./active-filter-chip";

function noop() {}

const meta = {
  title: "Transactions/ActiveFilterChip",
  component: ActiveFilterChip,
  args: { label: "Groceries", onRemove: noop },
} satisfies Meta<typeof ActiveFilterChip>;

export default meta;
type Story = StoryObj<typeof meta>;

/** No count: this filter leaves nothing out on its own, or the count is not known. */
export const Plain: Story = {};

/** With the rows this one filter excludes. */
export const WithExcludes: Story = { args: { label: "Bank A", excludes: 214 } };
