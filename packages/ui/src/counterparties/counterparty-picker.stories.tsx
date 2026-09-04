import type { Meta, StoryObj } from "@storybook/react-native-web-vite";
import { CounterpartyPicker } from "./counterparty-picker";

function noop() {}

const COUNTERPARTIES = [
  { id: "nina", name: "Nina", kind: "person" as const },
  { id: "marek", name: "Marek", kind: "person" as const },
  { id: "acme", name: "Acme Sp. z o.o.", kind: "company" as const },
];

const meta = {
  title: "Counterparties/CounterpartyPicker",
  component: CounterpartyPicker,
  args: {
    visible: true,
    counterparties: COUNTERPARTIES,
    onPick: noop,
    onCreateNew: noop,
    onDismiss: noop,
  },
} satisfies Meta<typeof CounterpartyPicker>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};

export const WithRecent: Story = {
  args: { recentIds: ["marek", "nina"] },
};

export const Empty: Story = {
  args: { counterparties: [] },
};
