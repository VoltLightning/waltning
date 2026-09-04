/**
 * `DualTotal` — `design-system/05` §5. C2's hero: `money.netWorth`, per
 * currency, stacked the way `CurrencyTotals` stacks its own rest.
 */

import type { Meta, StoryObj } from "@storybook/react-native-web-vite";
import * as money from "@waltning/core/money";
import { Text, View } from "react-native";
import { useT } from "../i18n/provider";
import { text } from "../theme/fonts.ts";
import { makeStyles } from "../theme/styles.ts";
import { space } from "../tokens.ts";
import { DualTotal } from "./dual-total";
import { Shell } from "./shell";

const meta = {
  title: "Shell/DualTotal",
  component: DualTotal,
  args: { mine: money.toMoney("12480.20"), ours: money.toMoney("18940.60"), currency: "PLN" },
  decorators: [
    (Story) => (
      <Shell hero={<Story />}>
        <View />
      </Shell>
    ),
  ],
  parameters: { layout: "fullscreen" },
} satisfies Meta<typeof DualTotal>;

export default meta;
type Story = StoryObj<typeof meta>;

/** One shared account exists — mine dominant, ours secondary. */
export const Default: Story = {};

/** No shared account — a single figure, never a household total of the same number twice. */
export const NoSharedAccount: Story = {
  args: { ours: null },
};

function Stack() {
  const t = useT();
  const styles = useStyles();
  return (
    <View style={styles.stack}>
      <DualTotal
        mine={money.toMoney("12480.20")}
        ours={money.toMoney("18940.60")}
        currency="PLN"
        lead={true}
      />
      <DualTotal
        mine={money.toMoney("400.00")}
        ours={money.toMoney("400.00")}
        currency="BYN"
        lead={false}
      />
      <Text style={styles.note}>{t("shell.heldSeparately")}</Text>
    </View>
  );
}

const useStyles = makeStyles((theme) => ({
  stack: { gap: space.md },
  note: { color: theme.shellTextMuted, ...text.ui("caption") },
}));

/** A second currency stacks beneath the lead — never summed into it (H21). */
export const StackedCurrencies: Story = {
  render: () => <Stack />,
};
