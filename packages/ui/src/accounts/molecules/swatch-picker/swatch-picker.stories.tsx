/**
 * An account's colour in the editor. *Its kind's* is the resting choice and is
 * drawn as the colour it would be; `Picked` is an account given one by hand.
 */

import type { Meta, StoryObj } from "@storybook/react-native-web-vite";
import { SwatchPicker } from "./swatch-picker";

function noop() {}

const meta = {
  title: "Accounts/SwatchPicker",
  component: SwatchPicker,
  args: { kind: "bank", value: null, onChange: noop },
} satisfies Meta<typeof SwatchPicker>;

export default meta;
type Story = StoryObj<typeof meta>;

/** Untouched: the kind's own colour, selected. */
export const KindsOwn: Story = {};

/** A colour picked by hand. */
export const Picked: Story = { args: { value: "rust" } };
