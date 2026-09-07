import type { Meta, StoryObj } from "@storybook/react-native-web-vite";
import { pivotPerUnit, toMoney } from "@waltning/core/money";
import { CounterpartyRow } from "./counterparty-row";

function noop() {}

const meta = {
  title: "Counterparties/CounterpartyRow",
  component: CounterpartyRow,
  args: {
    name: "Nina",
    kind: "person",
    settlement: { value: toMoney("74.44000000"), currency: "EUR" },
    onPress: noop,
  },
} satisfies Meta<typeof CounterpartyRow>;

export default meta;
type Story = StoryObj<typeof meta>;

export const TheyOweYou: Story = {};

export const YouOwe: Story = {
  args: {
    name: "Marek",
    settlement: { value: toMoney("-120.00000000"), currency: "PLN" },
  },
};

export const WithDisplayEquivalent: Story = {
  args: {
    display: { currency: "PLN", rate: pivotPerUnit("4.32") },
  },
};

export const Company: Story = {
  args: {
    name: "Acme Sp. z o.o.",
    kind: "company",
    settlement: { value: toMoney("4200.00000000"), currency: "PLN" },
    ageDays: 62,
    ageBucket: "61-90",
  },
};

export const Settled: Story = {
  args: {
    name: "Piotr",
    settlement: { value: toMoney("0.00000000"), currency: "PLN" },
  },
};

/**
 * P1's BLOCKER case — a held currency has no rate, so the fold is
 * incomplete. `settlement.value` is `null`, never a substitute
 * single-currency balance, and `balances` renders every held line stacked
 * instead, each with its own direction.
 */
export const NoNet: Story = {
  args: {
    settlement: { value: null, currency: "EUR" },
    balances: [
      { currency: "PLN", balance: toMoney("840.00000000") },
      { currency: "EUR", balance: toMoney("-120.00000000") },
    ],
  },
};
