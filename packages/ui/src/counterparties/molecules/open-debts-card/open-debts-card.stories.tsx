import type { Meta, StoryObj } from "@storybook/react-native-web-vite";
import { toMoney } from "@waltning/core/money";
import { OpenDebtsCard } from "./open-debts-card";

function noop() {}

const meta = {
  title: "Counterparties/OpenDebtsCard",
  component: OpenDebtsCard,
  args: {
    onOpenCounterparty: noop,
    lines: [
      {
        key: "b-EUR",
        counterpartyId: "b",
        name: "Tomasz",
        currency: "EUR",
        decimals: 2,
        balance: toMoney("150.00000000"),
      },
      {
        key: "a-EUR",
        counterpartyId: "a",
        name: "Nina",
        currency: "EUR",
        decimals: 2,
        balance: toMoney("-5.00000000"),
      },
    ],
  },
} satisfies Meta<typeof OpenDebtsCard>;

export default meta;
type Story = StoryObj<typeof meta>;

/** One of each direction — the words say it, never the colour alone. */
export const BothDirections: Story = {};

/** One person, two currencies: two lines, never folded. */
export const TwoCurrencies: Story = {
  args: {
    lines: [
      {
        key: "a-EUR",
        counterpartyId: "a",
        name: "Nina",
        currency: "EUR",
        decimals: 2,
        balance: toMoney("-5.00000000"),
      },
      {
        key: "a-PLN",
        counterpartyId: "a",
        name: "Nina",
        currency: "PLN",
        decimals: 2,
        balance: toMoney("-20.00000000"),
      },
    ],
  },
};
