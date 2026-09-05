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
import { userEvent, waitFor, within } from "storybook/test";
import { AmountField } from "./amount-field";

function noop() {}

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
  args: { variant: "hero", label: "Amount", currency: undefined, value: "48,90" },
};

/**
 * `transfer-composer.tsx`'s own fee field, unparsable and focused — H2's
 * fix: the ring encloses the whole `[input][affix]` field, in the danger
 * colour, rather than bisecting it around the input alone.
 */
export const FieldWithError: Story = {
  args: {
    variant: "field",
    label: "Fee",
    currency: "PLN",
    initial: "12,",
    onChange: noop,
    error: "Enter a number, or leave it blank.",
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const input = await canvas.findByLabelText("Fee");
    await userEvent.click(input);
    // Same race `search-field.stories.tsx`'s `Focused` waits out: `focused`
    // is React state one render behind the click's own DOM focus, and the
    // wrapper's ring is what that state drives.
    const wrapper = input.parentElement;
    await waitFor(() => {
      if (wrapper === null || getComputedStyle(wrapper).outlineStyle === "none") {
        throw new Error("field wrapper has not taken the focus ring yet");
      }
    });
  },
};
