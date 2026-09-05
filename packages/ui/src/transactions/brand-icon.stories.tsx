import type { Meta, StoryObj } from "@storybook/react-native-web-vite";
import { BrandIcon } from "./brand-icon";

const meta = {
  title: "Transactions/BrandIcon",
  component: BrandIcon,
  args: { brandKey: "orlen", payee: "ORLEN" },
} satisfies Meta<typeof BrandIcon>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Recognised: Story = {};

export const AnotherRecognised: Story = {
  args: { brandKey: "youtube", payee: "YouTube Premium" },
};

/** §14.4b — never blank: an unmatched payee still renders a mark, the same monogram treatment `CounterpartyRow` gives an unmatched name. */
export const Unrecognised: Story = {
  args: { brandKey: null, payee: "Corner Café" },
};

/**
 * Round 1's L10 — the two-character mark ("YT"), not the default one-
 * character "O", because a two-glyph mark in a 20px box is the case that
 * could overflow `numberOfLines={1}` and was the one size/mark combination
 * with no baseline pinning it.
 */
export const WidgetSize: Story = {
  args: { brandKey: "youtube", payee: "YouTube", size: 20 },
};
