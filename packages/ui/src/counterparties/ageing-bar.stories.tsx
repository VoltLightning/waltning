import type { Meta, StoryObj } from "@storybook/react-native-web-vite";
import { AgeingBar } from "./ageing-bar";

const meta = {
  title: "Counterparties/AgeingBar",
  component: AgeingBar,
  args: { ageDays: 12, bucket: "0-30" },
} satisfies Meta<typeof AgeingBar>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Fresh: Story = {};

export const Bucket31to60: Story = {
  args: { ageDays: 45, bucket: "31-60" },
};

export const Bucket61to90: Story = {
  args: { ageDays: 75, bucket: "61-90" },
};

export const NinetyPlus: Story = {
  args: { ageDays: 120, bucket: "90+" },
};
