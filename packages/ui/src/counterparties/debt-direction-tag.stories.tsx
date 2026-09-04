import type { Meta, StoryObj } from "@storybook/react-native-web-vite";
import { toMoney } from "@waltning/core/money";
import { DebtDirectionTag } from "./debt-direction-tag";

const meta = {
  title: "Counterparties/DebtDirectionTag",
  component: DebtDirectionTag,
  args: { balance: toMoney("840.00000000") },
} satisfies Meta<typeof DebtDirectionTag>;

export default meta;
type Story = StoryObj<typeof meta>;

export const TheyOweYou: Story = {};

export const YouOwe: Story = {
  args: { balance: toMoney("-120.00000000") },
};

export const Settled: Story = {
  args: { balance: toMoney("0.00000000") },
};
