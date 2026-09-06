/**
 * `AccountEditor` — S16 §4, §5, §7: `CreateAccountForm`'s fields, aimed at a
 * row that already exists.
 */

import type { Meta, StoryObj } from "@storybook/react-native-web-vite";
import * as money from "@waltning/core/money";
import { AccountEditor, type AccountEditorAccount } from "./account-editor";

function noop() {}

const ACCOUNT: AccountEditorAccount = {
  id: "acc-1",
  name: "Bank A · PLN",
  currency: "PLN",
  currencySymbol: "zł",
  decimals: 2,
  kind: "bank",
  ownership: "own",
  isBusiness: false,
  openingBalance: money.toMoney("6200"),
  openingDate: "2026-01-01",
  memo: "",
  groupId: null,
  version: 3,
  expectedBalance: null,
};

const GROUPS = [{ id: "group-bank-a", name: "Bank A" }];

const meta = {
  title: "Accounts/AccountEditor",
  component: AccountEditor,
  args: {
    account: ACCOUNT,
    today: "2026-08-24",
    groups: GROUPS,
    onCancel: noop,
    onSave: noop,
    onArchive: noop,
    onReconcile: noop,
    onCreateGroup: () => null,
  },
} satisfies Meta<typeof AccountEditor>;

export default meta;
type Story = StoryObj<typeof meta>;

/** Every field of an account that already exists — currency shown, not editable. */
export const Editor: Story = {};

/** S16 §5's last observation, shown beside currency. */
export const WithLastObserved: Story = {
  args: { account: { ...ACCOUNT, expectedBalance: money.toMoney("6198.30") } },
};

/** A refusal from the executor, landed on its field (`architecture/12`). */
export const StaleVersion: Story = {
  args: {
    fieldErrors: {
      byField: {},
      formLevel: ["version: This account changed elsewhere — reload and try again."],
    },
  },
};
