/**
 * `StatTile` — `design-system/05` §5.1. The two tiles S04 pairs beneath
 * `PeriodHeader` — *spent* and *net* — rendered inside `Shell` since that is
 * the only place either lives.
 */

import type { Meta, StoryObj } from "@storybook/react-native-web-vite";
import * as money from "@waltning/core/money";
import { View } from "react-native";
import { makeStyles } from "../theme/styles.ts";
import { space } from "../tokens.ts";
import { DualTotal } from "./dual-total";
import { Shell } from "./shell";
import { StatTile } from "./stat-tile";

const meta = {
  title: "Shell/StatTile",
  component: StatTile,
  args: { label: "spent", value: money.toMoney("-3210.40"), currency: "PLN" },
  decorators: [
    (Story) => (
      <Shell
        hero={
          <DualTotal
            mine={money.toMoney("12480.20")}
            ours={money.toMoney("18940.60")}
            currency="PLN"
          />
        }
      >
        <Story />
      </Shell>
    ),
  ],
  parameters: { layout: "fullscreen" },
} satisfies Meta<typeof StatTile>;

export default meta;
type Story = StoryObj<typeof meta>;

/** An outflow — `periodSpend` hands this tile an already-negative figure. */
export const Spent: Story = {};

/** Net can land on either side of zero; this month it is positive. */
export const Net: Story = {
  args: { label: "net", value: money.toMoney("840.20") },
};

function Row() {
  const styles = useStyles();
  return (
    <View style={styles.row}>
      <StatTile label="spent" value={money.toMoney("-3210.40")} currency="PLN" />
      <StatTile label="net" value={money.toMoney("840.20")} currency="PLN" />
    </View>
  );
}

const useStyles = makeStyles(() => ({
  row: { flexDirection: "row", gap: space.x5 },
}));

/** Both tiles, the way S04 pairs them under `PeriodHeader`. */
export const Pair: Story = {
  render: () => <Row />,
};
