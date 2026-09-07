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
];

const meta = {
  title: "Transactions/FieldsCard",
  component: FieldsCard,
  args: {
    fields: {
      date: "2026-08-06",
      accountId: "account-a",
      categoryId: "cat-eating-out",
      payee: "Café A",
      note: "",
      isBusiness: false,
    },
    accounts: ACCOUNTS,
    accountId: "account-a",
    onOpenAccountPicker: noop,
    today: "2026-08-06",
    categoryId: "cat-eating-out",
    categoryName: "Eating out",
    onOpenCategoryPicker: noop,
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
