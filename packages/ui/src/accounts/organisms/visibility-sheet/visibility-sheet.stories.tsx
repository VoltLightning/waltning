/**
 * `VisibilitySheet` — S16 §3's two pills: what the register shows, and what
 * its total counts.
 */

import type { Meta, StoryObj } from "@storybook/react-native-web-vite";
import { VisibilitySheet } from "./visibility-sheet";

function noop() {}

const ACCOUNTS = [
  { id: "bank-1", name: "Everyday", meta: "Bank · PLN", hidden: false, inTotal: true },
  { id: "bank-2", name: "Studio", meta: "Bank · PLN", hidden: false, inTotal: true },
  { id: "card-1", name: "Card A", meta: "Card · EUR", hidden: false, inTotal: true },
  // In the list, out of the total — the state one flag could not express.
  { id: "invest-1", name: "Vault", meta: "Investment · USD", hidden: false, inTotal: false },
  // Out of both, which is what hiding means.
  { id: "card-2", name: "Card B", meta: "Card · EUR", hidden: true, inTotal: false },
];

const meta = {
  title: "Accounts/VisibilitySheet",
  component: VisibilitySheet,
  args: {
    visible: true,
    accounts: ACCOUNTS,
    onChange: noop,
    onDismiss: noop,
  },
} satisfies Meta<typeof VisibilitySheet>;

export default meta;
type Story = StoryObj<typeof meta>;

/** Three ordinary accounts, one left out of the total, one hidden altogether. */
export const Default: Story = {};

/** Nothing decided yet — every account shown and counted, which is the default. */
export const AllCounted: Story = {
  args: {
    accounts: ACCOUNTS.map((account) => ({ ...account, hidden: false, inTotal: true })),
  },
};
