/**
 * `TextField` — §3.7. Label, hint, error, counter — and the rule that the
 * error *replaces* the hint rather than stacking under it.
 */

import type { Meta, StoryObj } from "@storybook/react-native-web-vite";
import { useState } from "react";
import { View } from "react-native";
import { makeStyles } from "../theme/styles.ts";
import { space } from "../tokens.ts";
import { TextField } from "./text-field";

function noop() {}

const meta = {
  title: "Primitives/TextField",
  component: TextField,
  args: { label: "Name", value: "", onChangeText: noop },
} satisfies Meta<typeof TextField>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Empty: Story = { args: { placeholder: "Bank A · PLN" } };

export const Filled: Story = { args: { value: "Bank A · PLN" } };

export const WithHint: Story = {
  args: { value: "Bank A · PLN", hint: "Shown on every row this account appears in." },
};

/** The border turns with the message — never the colour alone (P5). */
export const WithError: Story = {
  args: {
    value: "   ",
    hint: "Shown on every row this account appears in.",
    error: "A name needs at least one visible character.",
  },
};

/** Counts up: "11/120" states a fact where "109 left" sets a deadline. */
export const WithCounter: Story = {
  args: { value: "Bank A · PLN", maxLength: 120, counter: true },
};

export const Disabled: Story = { args: { value: "Bank A · PLN", disabled: true } };

export const Live: Story = { render: LiveDemo };

function LiveDemo() {
  const [value, setValue] = useState("");
  const styles = useStyles();
  return (
    <View style={styles.stack}>
      <TextField
        label="Name"
        value={value}
        onChangeText={setValue}
        maxLength={120}
        counter
        hint="Shown on every row this account appears in."
      />
    </View>
  );
}

const useStyles = makeStyles(() => ({
  stack: { gap: space.x2 },
}));
