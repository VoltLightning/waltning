/**
 * `Shell` — `design-system/05` §5.1. The sage band alone, so its clearance
 * arithmetic and header layout are visible independent of any one screen's
 * composition of it. `TodayFrame`'s own story is the composed proof.
 */

import type { Meta, StoryObj } from "@storybook/react-native-web-vite";
import * as money from "@waltning/core/money";
import { Text } from "react-native";
import { text } from "../theme/fonts.ts";
import { makeStyles } from "../theme/styles.ts";
import { DualTotal } from "./dual-total";
import { Shell } from "./shell";

function Heading({ children }: { children: string }) {
  const styles = useStyles();
  return <Text style={styles.heading}>{children}</Text>;
}

const useStyles = makeStyles((theme) => ({
  heading: { color: theme.shellText, ...text.display("displayTwo") },
}));

const meta = {
  title: "Shell/Shell",
  component: Shell,
  args: {
    leading: <Heading>Today</Heading>,
    hero: (
      <DualTotal mine={money.toMoney("12480.20")} ours={money.toMoney("18940.60")} currency="PLN" />
    ),
  },
  parameters: { layout: "fullscreen" },
} satisfies Meta<typeof Shell>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};
