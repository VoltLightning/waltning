/**
 * `RadioGroup` — §3.8. One choice from a short, visible list; the group is the
 * component, so a lone radio is unrepresentable.
 */

import type { Meta, StoryObj } from "@storybook/react-native-web-vite";
import { useState } from "react";
import { View } from "react-native";
import { makeStyles } from "../theme/styles.ts";
import { space } from "../tokens.ts";
import { RadioGroup } from "./radio";

function noop() {}

const OPTIONS = [
  { value: "checking", label: "Checking", hint: "Day-to-day spending" },
  { value: "savings", label: "Savings" },
  { value: "cash", label: "Cash" },
] as const;

const meta = {
  title: "Primitives/RadioGroup",
  component: RadioGroup,
  args: { label: "Account kind", options: OPTIONS, value: null, onChange: noop },
} satisfies Meta<typeof RadioGroup>;

export default meta;
type Story = StoryObj<typeof meta>;

/** `null` before the first pick — a default is the caller's decision. */
export const Unanswered: Story = {};

export const Answered: Story = { args: { value: "savings" } };

export const OptionDisabled: Story = {
  args: {
    value: "checking",
    options: [OPTIONS[0], OPTIONS[1], { value: "cash", label: "Cash", disabled: true }] as const,
  },
};

export const GroupDisabled: Story = { args: { value: "checking", disabled: true } };

/** The dot pops like the checkbox's mark — one landing event, system-wide. */
export const Live: Story = { render: LiveDemo };

function LiveDemo() {
  const [value, setValue] = useState<string | null>(null);
  const styles = useStyles();
  return (
    <View style={styles.stack}>
      <RadioGroup label="Account kind" options={OPTIONS} value={value} onChange={setValue} />
    </View>
  );
}

const useStyles = makeStyles(() => ({
  stack: { gap: space.x2 },
}));
