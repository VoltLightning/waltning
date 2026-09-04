/**
 * `AmountField` — `design-system/03` §3.7. The `hero` variant is S05's
 * `display-hero` amount, driven by `Keypad` rather than an editable field.
 *
 * A discriminated union of props (`variant: "field" | "hero"`) does not merge
 * across `meta.args` and a story's own `args` the way a flat prop type does —
 * Storybook's typing wants the union satisfied whole at each story, not a
 * partial patch — so every story below states its full `args` rather than a
 * delta over the default.
 */

import type { Meta, StoryObj } from "@storybook/react-native-web-vite";
import { AmountField } from "./amount-field";

const meta = {
  title: "FX/AmountField",
  component: AmountField,
  args: { variant: "hero", label: "Amount", currency: "PLN", value: "48,90" },
} satisfies Meta<typeof AmountField>;

export default meta;
type Story = StoryObj<typeof meta>;

/** S05 §3's `display-hero` amount, keypad-driven. */
export const Hero: Story = {
  args: { variant: "hero", label: "Amount", currency: "PLN", value: "48,90" },
};

/** The resting state — S05 §6: "a blank amount is the resting state, not an empty state." */
export const HeroEmpty: Story = {
  args: { variant: "hero", label: "Amount", currency: "PLN", value: "" },
};

/** No account chosen yet — the amount has no currency to be labelled in. */
export const HeroNoCurrency: Story = {
  args: { variant: "hero", label: "Amount", value: "48,90" },
};
