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

export const WidgetSize: Story = {
  args: { size: 20 },
};
