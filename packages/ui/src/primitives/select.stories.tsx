/**
 * `Select` — §3.8. A choice folded away until asked for. Its sibling has its
 * own file: `multi-select.stories.tsx`, because a component the picker hides
 * behind another's stories is a component nobody finds.
 *
 * `defaultOpen` is what lets the fixed stories show the disclosed states —
 * the panel, the turned chevron, the lit row, the scroll cap and the filter
 * row all only exist while open, and a screenshot suite cannot click.
 */

import type { Meta, StoryObj } from "@storybook/react-native-web-vite";
import { useState } from "react";
import { View } from "react-native";
import { makeStyles } from "../theme/styles.ts";
import { space } from "../tokens.ts";
import { Select } from "./select";

function noop() {}

const CURRENCIES = [
  { value: "PLN", label: "Polish Złoty" },
  { value: "BYN", label: "Belarusian Ruble" },
  { value: "USD", label: "US Dollar" },
  { value: "GEL", label: "Georgian Lari", disabled: true },
] as const;

/** Twelve rows — enough to show the cap and give the filter something to do. */
const MANY = Array.from({ length: 12 }, (_ignored, index) => ({
  value: `opt-${String(index).padStart(2, "0")}`,
  label: `Account ${String(index + 1).padStart(2, "0")} · PLN`,
}));

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

/** The panel, the turned chevron, and the chosen row lit with its check. */
export const Open: Story = { args: { value: "PLN", defaultOpen: true } };

/**
 * Six and a half rows, then scroll — the half row is the signal that there is
 * more, the way a list edge says it everywhere else.
 */
export const LongList: Story = {
  args: { options: MANY, value: "opt-03", defaultOpen: true },
};

/** The filter row, for the lists scrolling cannot carry (52 accounts, S16). */
export const Searchable: Story = {
  args: { options: MANY, value: null, searchable: true, defaultOpen: true },
};

/** Picking is answering — the panel folds on choice. */
export const Live: Story = { render: LiveDemo };

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

const useStyles = makeStyles(() => ({
  stack: { gap: space.x2 },
}));
