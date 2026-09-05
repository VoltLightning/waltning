/** `LedgerSelectionBar` — S10 §7 (web): the strip above `<LedgerTable>` once a range is selected. */

import type { Meta, StoryObj } from "@storybook/react-native-web-vite";
import { fn } from "storybook/test";
import { LedgerSelectionBar } from "./ledger-selection-bar";

const meta = {
  title: "Transactions/LedgerSelectionBar",
  component: LedgerSelectionBar,
  args: { count: 24, onCategorize: fn(), onClear: fn() },
} satisfies Meta<typeof LedgerSelectionBar>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};

/** Renders nothing — the caller mounts this only once `selection.count > 0`. */
export const Empty: Story = { args: { count: 0 } };
