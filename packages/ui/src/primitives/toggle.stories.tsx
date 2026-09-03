/**
 * `Toggle` — §3.7's switch, for a state rather than an action.
 *
 * The live story is the one that matters here: the thumb's slide at
 * `motion.base` and the instant track swap under it are the §2.7 asymmetry,
 * and a screenshot cannot show it. The fixed stories pin the two resting
 * states for the visual suite.
 */

import type { Meta, StoryObj } from "@storybook/react-native-web-vite";
import { useState } from "react";
import { View } from "react-native";
import { makeStyles } from "../theme/styles.ts";
import { space } from "../tokens.ts";
import { Toggle } from "./toggle";

function noop() {}

const meta = {
  title: "Primitives/Toggle",
  component: Toggle,
  args: { label: "Business account", value: false, onChange: noop },
} satisfies Meta<typeof Toggle>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Off: Story = {};

export const On: Story = { args: { value: true } };

export const WithHint: Story = {
  args: {
    value: true,
    hint: "Its transactions default to the business scope.",
  },
};

export const Disabled: Story = { args: { value: true, disabled: true } };

/** Flip it — the thumb slides, the track swaps instantly underneath. */
export const Live: Story = { render: LiveDemo };

function LiveDemo() {
  const [on, setOn] = useState(false);
  const styles = useStyles();
  return (
    <View style={styles.stack}>
      <Toggle label="Business account" value={on} onChange={setOn} />
    </View>
  );
}

const useStyles = makeStyles(() => ({
  stack: { gap: space.x2 },
}));
