/**
 * `FieldsCard` — S09's editable fields, each a labelled row: kicker left,
 * value right, a drawn chevron, a hairline between rows. `Opened` drives a
 * field open the way a person taps one; `Changed` goes one step further and
 * enables `Save`, which is the *Done when* every field-level test checks.
 */

import type { Meta, StoryObj } from "@storybook/react-native-web-vite";
import { expect, fireEvent, userEvent, within } from "storybook/test";
import { FieldsCard } from "./fields-card";

function noop() {}

const ACCOUNTS = [
  {
    id: "account-a",
    name: "Cash · PLN",
    currency: "PLN",
    kind: "cash" as const,
    capturable: true,
    ownership: "own" as const,
    groupId: null,
  },
  {
    id: "account-b",
    name: "Bank A · PLN",
    currency: "PLN",
    kind: "bank" as const,
    capturable: true,
    ownership: "own" as const,
    groupId: null,
  },
  {
    id: "account-c",
    name: "Card A · EUR",
    currency: "EUR",
    kind: "card" as const,
    capturable: true,
    ownership: "own" as const,
    groupId: null,
  },
];

const meta = {
  title: "Transactions/FieldsCard",
  component: FieldsCard,
  args: {
    fields: {
      type: "expense",
      date: "2026-08-06",
      accountId: "account-a",
      amount: "48.90",
      toAccountId: null,
      toAmount: null,
      fee: null,
      categoryId: "cat-eating-out",
      counterpartyId: null,
      obligationCounterpartyId: null,
      obligationRole: null,
      enteredName: "Café A",
      note: "",
      isBusiness: false,
      isCapital: false,
    },
    accounts: ACCOUNTS,
    accountId: "account-a",
    onOpenAccountPicker: noop,
    today: "2026-08-06",
    categoryId: "cat-eating-out",
    categoryName: "Eating out",
    onOpenCategoryPicker: noop,
    counterpartyId: null,
    counterpartyName: null,
    obligationCounterpartyId: null,
    obligationCounterpartyName: null,
    onOpenCounterpartyPicker: noop,
    onSave: noop,
  },
} satisfies Meta<typeof FieldsCard>;

export default meta;
type Story = StoryObj<typeof meta>;

/** Every field shown, `Save` disabled — nothing has changed yet. */
export const Default: Story = {};

/** A field opened — the accordion, mid-edit. */
export const Opened: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await userEvent.click(await canvas.findByRole("button", { name: "Payee: Café A" }));
    await expect(canvas.findByLabelText("Payee")).resolves.toBeDefined();
  },
};

/** A field actually changed — `Save` enables. */
export const Changed: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await userEvent.click(await canvas.findByRole("button", { name: "Payee: Café A" }));
    const field = await canvas.findByLabelText("Payee");
    fireEvent.change(field, { target: { value: "Bakery A" } });
    await expect(canvas.findByRole("button", { name: "Save" })).resolves.not.toHaveProperty(
      "disabled",
      true,
    );
  },
};

/** A stale-version refusal — form level, names no single field. */
export const ChangedElsewhere: Story = {
  args: {
    fieldErrors: {
      byField: {},
      formLevel: ["This transaction changed elsewhere — reload it before saving."],
    },
  },
};

/**
 * §6.6 — with a counterparty set, the role is a row of its own; §6.8's
 * one-off toggle sits under it either way.
 */
export const WithCounterparty: Story = {
  args: {
    fields: {
      type: "expense",
      date: "2026-08-06",
      accountId: "account-a",
      amount: "48.90",
      toAccountId: null,
      toAmount: null,
      fee: null,
      categoryId: "cat-eating-out",
      counterpartyId: null,
      obligationCounterpartyId: "cp-nina",
      obligationRole: "debt",
      enteredName: "Café A",
      note: "",
      isBusiness: false,
      isCapital: true,
    },
    obligationCounterpartyId: "cp-nina",
    counterpartyName: "Nina",
  },
};

/**
 * A transfer — the same card. It adds *To*, the destination figure (two
 * currencies here) and the fee, and has no category and no entered name. It
 * keeps the counterparty and *Someone owes*: a repayment can land straight in
 * an account.
 */
export const Transfer: Story = {
  args: {
    fields: {
      type: "transfer",
      date: "2026-07-14",
      accountId: "account-b",
      amount: "381.64",
      toAccountId: "account-c",
      toAmount: "88.34",
      fee: null,
      categoryId: null,
      counterpartyId: null,
      obligationCounterpartyId: null,
      obligationRole: null,
      enteredName: "",
      note: "",
      isBusiness: false,
      isCapital: false,
    },
    accountId: "account-b",
    toAccountId: "account-c",
    onOpenToAccountPicker: noop,
    categoryId: null,
    categoryName: null,
  },
};
