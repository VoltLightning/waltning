import type { Meta, StoryObj } from "@storybook/react-native-web-vite";
import { CounterpartyCard } from "./counterparty-card";

const meta = {
  title: "Counterparties/CounterpartyCard",
  component: CounterpartyCard,
  args: { name: "Nina", kind: "person", settlementCurrency: "EUR" },
} satisfies Meta<typeof CounterpartyCard>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Person: Story = {};

export const CompanyWithAgeing: Story = {
  args: {
    name: "Acme Sp. z o.o.",
    kind: "company",
    settlementCurrency: "PLN",
    ageing: { ageDays: 62, bucket: "61-90" },
  },
};

export const NoSettlementCurrency: Story = {
  args: { settlementCurrency: null },
};
