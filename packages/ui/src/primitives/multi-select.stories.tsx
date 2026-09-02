/**
 * `MultiSelect` — §3.8. Picking is collecting: the panel stays open across
 * picks, and the field restates the chosen labels — never an invented count.
 *
 * Its own title, deliberately. It shipped as a `Live Multi` story inside
 * Select's file and read as a variant of Select rather than a control — which
 * is exactly what a Storybook sidebar is for saying otherwise.
 */

import type { Meta, StoryObj } from "@storybook/react-native-web-vite";
import { useState } from "react";
import { View } from "react-native";
import { makeStyles } from "../theme/styles.ts";
import { space } from "../tokens.ts";
import { MultiSelect } from "./select";

function noop() {}

const CURRENCIES = [
  { value: "PLN", label: "Polish Złoty" },
  { value: "BYN", label: "Belarusian Ruble" },
  { value: "USD", label: "US Dollar" },
  { value: "GEL", label: "Georgian Lari" },
] as const;

/** Twelve rows — enough to show the scroll cap and give the filter work. */
const MANY = Array.from({ length: 12 }, (_ignored, index) => ({
  value: `cat-${String(index).padStart(2, "0")}`,
  label: `Category ${String(index + 1).padStart(2, "0")}`,
}));

const meta = {
  title: "Primitives/MultiSelect",
  component: MultiSelect,
  args: {
    label: "Currencies",
    placeholder: "Choose currencies",
    options: CURRENCIES,
    values: [],
    onChange: noop,
  },
} satisfies Meta<typeof MultiSelect>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Empty: Story = {};

/**
 * The collection as removable tokens — each × takes one out with the panel
 * closed. A pick is undone where it shows.
 */
export const Collected: Story = { args: { values: ["PLN", "BYN"] } };

/** Several rows lit at once — the shape Select can never show. */
export const Open: Story = { args: { values: ["PLN", "GEL"], defaultOpen: true } };

/** The filter over a long list, with two picks already made. */
export const Searchable: Story = {
  args: {
    options: MANY,
    values: ["cat-01", "cat-07"],
    searchable: true,
    defaultOpen: true,
  },
};

export const Disabled: Story = { args: { values: ["PLN"], disabled: true } };

/** Pick several — the panel holds, the field grows. */
export const Live: Story = { render: LiveDemo };

function LiveDemo() {
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
        searchable
      />
    </View>
  );
}

const useStyles = makeStyles(() => ({
  stack: { gap: space.x2 },
}));
