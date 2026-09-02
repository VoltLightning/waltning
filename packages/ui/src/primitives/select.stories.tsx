/**
 * `Select` and `MultiSelect` — §3.8. A choice folded away until asked for.
 *
 * The open stories are the ones the visual suite needs: the panel, the turned
 * chevron and the lit rows only exist while disclosed, and only the live
 * stories can disclose them — so each fixed story pins a closed state and the
 * live pair carries the interaction.
 */

import type { Meta, StoryObj } from "@storybook/react-native-web-vite";
import { useState } from "react";
import { View } from "react-native";
import { makeStyles } from "../theme/styles.ts";
import { space } from "../tokens.ts";
import { MultiSelect, Select } from "./select";

function noop() {}

const CURRENCIES = [
  { value: "PLN", label: "Polish Złoty" },
  { value: "BYN", label: "Belarusian Ruble" },
  { value: "USD", label: "US Dollar" },
  { value: "GEL", label: "Georgian Lari", disabled: true },
] as const;

const meta = {
  title: "Primitives/Select",
  component: Select,
  args: {
    label: "Currency",
    placeholder: "Choose a currency",
    options: CURRENCIES,
    value: null,
    onChange: noop,
  },
} satisfies Meta<typeof Select>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Unanswered: Story = {};

export const Answered: Story = { args: { value: "PLN" } };

export const Disabled: Story = { args: { value: "PLN", disabled: true } };

/** Picking is answering — the panel folds on choice. */
export const Live: Story = { render: LiveDemo };

/** Picking is collecting — the panel stays open and the field restates it. */
export const LiveMulti: Story = { render: LiveMultiDemo };

function LiveDemo() {
  const [value, setValue] = useState<string | null>(null);
  const styles = useStyles();
  return (
    <View style={styles.stack}>
      <Select
        label="Currency"
        placeholder="Choose a currency"
        options={CURRENCIES}
        value={value}
        onChange={setValue}
      />
    </View>
  );
}

function LiveMultiDemo() {
  const [values, setValues] = useState<readonly string[]>([]);
  const styles = useStyles();
  return (
    <View style={styles.stack}>
      <MultiSelect
        label="Currencies"
        placeholder="Choose currencies"
        options={CURRENCIES}
        values={values}
        onChange={setValues}
      />
    </View>
  );
}

const useStyles = makeStyles(() => ({
  stack: { gap: space.x2 },
}));
