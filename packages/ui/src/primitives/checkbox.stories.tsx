/**
 * `Checkbox` — §3.8. Independent yes/no facts, each row its own answer.
 */

import type { Meta, StoryObj } from "@storybook/react-native-web-vite";
import { useState } from "react";
import { View } from "react-native";
import { makeStyles } from "../theme/styles.ts";
import { space } from "../tokens.ts";
import { Checkbox } from "./checkbox";

function noop() {}

const meta = {
  title: "Primitives/Checkbox",
  component: Checkbox,
  args: { label: "Include archived accounts", checked: false, onChange: noop },
} satisfies Meta<typeof Checkbox>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Unchecked: Story = {};

export const Checked: Story = { args: { checked: true } };

export const WithHint: Story = {
  args: {
    checked: true,
    hint: "Archived accounts keep their history and stay out of totals.",
  },
};

export const Disabled: Story = { args: { checked: true, disabled: true } };

/** The mark pops in at `motion.fast`; unchecking is instant, deliberately. */
export const Live: Story = { render: LiveDemo };

function LiveDemo() {
  const [checked, setChecked] = useState(false);
  const styles = useStyles();
  return (
    <View style={styles.stack}>
      <Checkbox label="Include archived accounts" checked={checked} onChange={setChecked} />
    </View>
  );
}

const useStyles = makeStyles(() => ({
  stack: { gap: space.x2 },
}));
