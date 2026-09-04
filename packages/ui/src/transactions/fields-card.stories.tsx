/**
 * `FieldsCard` — S09's editable fields, each behind a `Chip`. `Opened` drives
 * a field open the way a person taps one; `Changed` goes one step further and
 * enables `Save`, which is the *Done when* every field-level test checks.
 */

import type { Meta, StoryObj } from "@storybook/react-native-web-vite";
import { expect, fireEvent, userEvent, within } from "storybook/test";
import { FieldsCard } from "./fields-card";

function noop() {}

const ACCOUNTS = [
  { id: "account-a", name: "Cash · PLN" },
  { id: "account-b", name: "Bank A · PLN" },
];

const meta = {
  title: "Transactions/FieldsCard",
  component: FieldsCard,
  args: {
    fields: {
      date: "2026-08-06",
      accountId: "account-a",
      categoryId: "cat-eating-out",
      payee: "Costa",
      note: "",
      isBusiness: false,
    },
    accounts: ACCOUNTS,
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
    await userEvent.click(await canvas.findByRole("button", { name: "Payee: Costa" }));
    await expect(canvas.findByLabelText("Payee")).resolves.toBeDefined();
  },
};

/** A field actually changed — `Save` enables. */
export const Changed: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await userEvent.click(await canvas.findByRole("button", { name: "Payee: Costa" }));
    const field = await canvas.findByLabelText("Payee");
    fireEvent.change(field, { target: { value: "Costa Coffee" } });
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
