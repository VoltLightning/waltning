import type { Meta, StoryObj } from "@storybook/react-native-web-vite";
import { toMoney } from "@waltning/core/money";
import { CounterpartyForm, type CounterpartyFormValues } from "./counterparty-form";

function noop() {}

const CURRENCIES = [
  { code: "PLN", name: "Polish Złoty" },
  { code: "EUR", name: "Euro" },
];

const NEW: CounterpartyFormValues = {
  name: "",
  kind: "person",
  settlementCurrency: null,
  contact: "",
  note: "",
};

const meta = {
  title: "Counterparties/CounterpartyForm",
  component: CounterpartyForm,
  args: {
    initial: NEW,
    currencies: CURRENCIES,
    matches: [],
    onNameBlur: noop,
    onSame: noop,
    onDifferent: noop,
    onCancel: noop,
    onSave: noop,
  },
} satisfies Meta<typeof CounterpartyForm>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Create: Story = {};

export const Editing: Story = {
  args: {
    initial: {
      name: "Nina",
      kind: "person",
      settlementCurrency: "EUR",
      contact: "nina@example.com",
      note: "",
    },
    onArchive: noop,
  },
};

export const NearMatch: Story = {
  args: {
    initial: { ...NEW, name: "Ninna" },
    matches: [
      {
        id: "nina",
        name: "Nina",
        balance: toMoney("840.00000000"),
        currency: "PLN",
        transactionCount: 23,
      },
    ],
  },
};

export const ThreeCandidates: Story = {
  args: {
    initial: { ...NEW, name: "Nina" },
    matches: [
      {
        id: "a",
        name: "Nina",
        balance: toMoney("840.00000000"),
        currency: "PLN",
        transactionCount: 23,
      },
      {
        id: "b",
        name: "Ninna",
        balance: toMoney("0.00000000"),
        currency: "PLN",
        transactionCount: 1,
      },
      {
        id: "c",
        name: "Niina",
        balance: toMoney("-40.00000000"),
        currency: "PLN",
        transactionCount: 4,
      },
    ],
  },
};

export const NameCollisionError: Story = {
  args: {
    initial: { ...NEW, name: "nina" },
    fieldErrors: {
      byField: { name: ['A counterparty named "Nina" already exists.'] },
      formLevel: [],
    },
  },
};
