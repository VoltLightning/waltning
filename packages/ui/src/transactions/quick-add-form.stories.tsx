/**
 * `QuickAddForm` — amount and account stay the fast default; everything else
 * S05 §3 lists is one fold away.
 *
 * The three states below are the ones a static screenshot cannot reach by
 * itself — the *More* fold, the income tab, and a counterparty's role — so
 * each carries a `play` function that drives the same clicks a person would,
 * the way `button.stories.tsx`'s `Pressed` story does.
 *
 * `WithErrors` is the field-errors card's *Done when*, photographed: two
 * errors from one `fieldErrors` map land on their own fields
 * (`amountOriginal`, `accountId`), and a path the form does not know about
 * (`currency` — the controller's, never asked for here) still reads, under
 * the `common.couldNotSave` alert.
 */

import type { Meta, StoryObj } from "@storybook/react-native-web-vite";
import { currencyCode } from "@waltning/core/money";
import { expect, userEvent, within } from "storybook/test";
import { QuickAddForm } from "./quick-add-form";

function noop() {}

const ACCOUNTS = [
  { id: "account-a", name: "Bank A · PLN", currency: currencyCode("PLN"), capturable: true },
  { id: "account-b", name: "Bank B · BYN", currency: currencyCode("BYN"), capturable: true },
];

const CATEGORIES = [
  { id: "cat-groceries", name: "Groceries", kind: "expense" },
  { id: "cat-eating-out", name: "Eating out", kind: "expense" },
  { id: "cat-salary", name: "Salary", kind: "income" },
] as const;

const meta = {
  title: "Transactions/QuickAddForm",
  component: QuickAddForm,
  args: {
    accounts: ACCOUNTS,
    categories: CATEGORIES,
    counterparties: [],
    today: "2026-08-24",
    accountId: null,
    onOpenAccountPicker: noop,
    categoryId: null,
    onOpenCategoryPicker: noop,
    onCancel: noop,
    onSave: noop,
  },
} satisfies Meta<typeof QuickAddForm>;

export default meta;
type Story = StoryObj<typeof meta>;

/** The default: amount, account, type, category and the *More* fold — nothing open yet. */
export const Collapsed: Story = {};

/** *More*, opened — date, note, business, and (with none here) no counterparty field. */
export const Expanded: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await userEvent.click(await canvas.findByRole("button", { name: "More" }));
    await expect(canvas.findByLabelText("Date")).resolves.toBeDefined();
  },
};

/** The keypad never signs (§7.2) — the `Income` tab is the only place direction is chosen. */
export const Income: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await userEvent.click(await canvas.findByRole("tab", { name: "Income" }));
    await expect(canvas.findByRole("tab", { name: "Income" })).resolves.toBeDefined();
  },
};

/** §6.6 — a counterparty, expanded, with its role showing once it is picked. */
export const WithCounterparty: Story = {
  args: {
    counterparties: [
      { id: "cp-a", name: "Counterparty A" },
      { id: "cp-b", name: "Counterparty B" },
    ],
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await userEvent.click(await canvas.findByRole("button", { name: "More" }));
    await userEvent.click(await canvas.findByRole("button", { name: "Counterparty" }));
    await userEvent.click(await canvas.findByRole("radio", { name: "Counterparty A" }));
    await expect(canvas.findByRole("radiogroup", { name: "Role" })).resolves.toBeDefined();
  },
};

export const WithErrors: Story = {
  args: {
    fieldErrors: {
      byField: {
        amountOriginal: ["Amount must be greater than zero"],
        accountId: ["Choose an account before saving"],
      },
      formLevel: ["currency: not accepted"],
    },
  },
};
