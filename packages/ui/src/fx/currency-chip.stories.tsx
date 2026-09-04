/**
 * `CurrencyChip` — `design-system/04` §4.5. The display-currency toggle,
 * resident in every header.
 *
 * **Storied on `theme.shell`, never the bare canvas.** The component paints
 * no background of its own — it is drawn *into* a header that already is
 * one (`Shell`, `DeskBand`) — so `shellTextMuted`/`shellText` measured
 * against the visual suite's default ground fails contrast (1.05:1) even
 * though the shipped composition never does. The decorator below is what
 * `DeskBand`'s own stories get for free by painting their band inline.
 */

import type { Meta, StoryObj } from "@storybook/react-native-web-vite";
import type { ReactNode } from "react";
import { View } from "react-native";
import { makeStyles } from "../theme/styles.ts";
import { space } from "../tokens.ts";
import { CurrencyChip } from "./currency-chip";

function noop() {}

function ShellGround({ children }: { children: ReactNode }) {
  const styles = useStyles();
  return <View style={styles.ground}>{children}</View>;
}

const useStyles = makeStyles((theme) => ({
  ground: { backgroundColor: theme.shell, padding: space.x4, alignItems: "flex-start" },
}));

const meta = {
  title: "FX/CurrencyChip",
  component: CurrencyChip,
  args: {
    pinned: [{ code: "PLN" }, { code: "USD" }, { code: "EUR" }],
    active: "PLN",
    onChange: noop,
  },
  decorators: [
    (Story) => (
      <ShellGround>
        <Story />
      </ShellGround>
    ),
  ],
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
