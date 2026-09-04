/**
 * `CurrencyChip` — `design-system/04` §4.5. The display-currency toggle,
 * resident in every header.
 */

import type { Meta, StoryObj } from "@storybook/react-native-web-vite";
import { CurrencyChip } from "./currency-chip";

function noop() {}

const meta = {
  title: "FX/CurrencyChip",
  component: CurrencyChip,
  args: {
    pinned: [{ code: "PLN" }, { code: "USD" }, { code: "EUR" }],
    active: "PLN",
    onChange: noop,
  },
} satisfies Meta<typeof CurrencyChip>;

export default meta;
type Story = StoryObj<typeof meta>;

/** Three pinned — the seeded default. A tap cycles. */
export const ThreePinned: Story = {};

export const TwoPinned: Story = {
  args: { pinned: [{ code: "PLN" }, { code: "USD" }], active: "USD" },
};

/** Before the first account — nothing to show. */
export const Empty: Story = { args: { pinned: [] } };

/** Past three — a tap calls `onExpand` instead of cycling. */
export const ManyPinned: Story = {
  args: {
    pinned: [{ code: "PLN" }, { code: "USD" }, { code: "EUR" }, { code: "GBP" }],
    active: "PLN",
    onExpand: noop,
  },
};
