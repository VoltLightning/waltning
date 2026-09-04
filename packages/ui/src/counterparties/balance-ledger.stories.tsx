import type { Meta, StoryObj } from "@storybook/react-native-web-vite";
import { pivotPerUnit, toMoney } from "@waltning/core/money";
import { BalanceLedger } from "./balance-ledger";

const meta = {
  title: "Counterparties/BalanceLedger",
  component: BalanceLedger,
  args: {
    rows: [
      { currency: "PLN", balance: toMoney("840.00000000") },
      { currency: "EUR", balance: toMoney("-120.00000000") },
    ],
    settlementCurrency: "EUR",
    settlementNet: toMoney("74.44000000"),
  },
} satisfies Meta<typeof BalanceLedger>;

export default meta;
type Story = StoryObj<typeof meta>;

export const MixedDirection: Story = {};

export const WithDisplayEquivalent: Story = {
  args: {
    display: { currency: "PLN", rate: pivotPerUnit("4.32") },
  },
};

export const SingleCurrency: Story = {
  args: {
    rows: [{ currency: "PLN", balance: toMoney("-120.00000000") }],
    settlementCurrency: "PLN",
    settlementNet: toMoney("-120.00000000"),
  },
};

export const IncompleteFold: Story = {
  args: {
    rows: [{ currency: "USD", balance: toMoney("10.00000000") }],
    settlementNet: null,
  },
};

export const AllSettled: Story = {
  args: {
    rows: [{ currency: "EUR", balance: toMoney("0.00000000") }],
    settlementCurrency: "EUR",
    settlementNet: toMoney("0.00000000"),
  },
};
