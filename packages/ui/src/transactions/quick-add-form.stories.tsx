/**
 * `QuickAddForm` — amount and account, plus where a refusal lands.
 *
 * `WithErrors` is the card's *Done when*, photographed: two errors from one
 * `fieldErrors` map on their own fields (`amountOriginal`, `accountId`), and a
 * path the form does not know about (`date` — this form never asks for one;
 * it captures against `today`) still reads, under the `common.couldNotSave`
 * alert.
 */

import type { Meta, StoryObj } from "@storybook/react-native-web-vite";
import { currencyCode } from "@waltning/core/money";
import { QuickAddForm } from "./quick-add-form";

function noop() {}

const ACCOUNTS = [
  { id: "account-a", name: "Bank A · PLN", currency: currencyCode("PLN"), capturable: true },
  { id: "account-b", name: "Bank B · BYN", currency: currencyCode("BYN"), capturable: true },
];

const meta = {
  title: "Transactions/QuickAddForm",
  component: QuickAddForm,
  args: { accounts: ACCOUNTS, onCancel: noop, onCreateAccount: noop, onSave: noop },
} satisfies Meta<typeof QuickAddForm>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};

export const NeedsRate: Story = {
  args: {
    accounts: [
      { id: "account-a", name: "Bank A · PLN", currency: currencyCode("PLN"), capturable: false },
    ],
    initialAccountId: "account-a",
  },
};

export const WithErrors: Story = {
  args: {
    fieldErrors: {
      byField: {
        amountOriginal: ["Expense amount must be greater than zero"],
        accountId: ["Choose an account before saving"],
      },
      formLevel: ["date: not accepted"],
    },
  },
};
