/**
 * `AccountRegister` — S16 §3, §4, §6: every account, grouped by kind, shared
 * apart and not diminished, archived behind a toggle, search above all of it.
 */

import type { Meta, StoryObj } from "@storybook/react-native-web-vite";
import * as money from "@waltning/core/money";
import { userEvent, waitFor, within } from "storybook/test";
import { AccountRegister, type AccountRegisterAccount } from "./account-register";

function noop() {}

function account(overrides: Partial<AccountRegisterAccount>): AccountRegisterAccount {
  return {
    id: overrides.id ?? "acc",
    name: "Account",
    kind: "bank",
    ownership: "own",
    balance: money.toMoney("0"),
    currency: "PLN",
    isBusiness: false,
    expectedBalance: null,
    ...overrides,
  };
}

const POPULATED: readonly AccountRegisterAccount[] = [
  account({ id: "bank-1", name: "Bank A · PLN", kind: "bank", balance: money.toMoney("6200") }),
  account({
    id: "bank-2",
    name: "Bank A/BIZ · PLN",
    kind: "bank",
    balance: money.toMoney("2220.10"),
    isBusiness: true,
  }),
  account({ id: "cash-1", name: "Cash · PLN", kind: "cash", balance: money.toMoney("840") }),
  account({
    id: "clearing-1",
    name: "Clearing · PLN",
    kind: "clearing",
    balance: money.toMoney("340"),
  }),
];

const SHARED: readonly AccountRegisterAccount[] = [
  ...POPULATED,
  account({
    id: "shared-1",
    name: "Household · USD",
    kind: "deposit",
    ownership: "shared",
    currency: "USD",
    balance: money.toMoney("1800"),
  }),
];

const ARCHIVED: readonly AccountRegisterAccount[] = [
  account({ id: "old-1", name: "Old · PLN", kind: "bank", balance: money.toMoney("0") }),
];

const meta = {
  title: "Accounts/AccountRegister",
  component: AccountRegister,
  args: {
    accounts: POPULATED,
    archivedAccounts: [],
    onSelectAccount: noop,
    onLoadArchived: noop,
    onCreateAccount: noop,
  },
} satisfies Meta<typeof AccountRegister>;

export default meta;
type Story = StoryObj<typeof meta>;

/** Grouped by kind, each with its own subtotal — the register's ordinary state. */
export const Populated: Story = {};

/** A shared account, apart and at the same weight, never inside a kind group. */
export const WithShared: Story = { args: { accounts: SHARED } };

/** The toggle open — archived accounts, muted, with their own count. */
export const WithArchived: Story = {
  args: { accounts: POPULATED, archivedAccounts: ARCHIVED },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await userEvent.click(await canvas.findByText("Archived"));
    // The row mounts the instant `archivedOpen` flips, but the click's own
    // press-scale (`press-scale.ts`) is still settling back to 1 — a
    // screenshot taken mid-settle catches the row's text at partial opacity.
    // `ArchivedToggle` puts no opacity on the row itself (a whole-row fade
    // failed `axe`'s contrast check there), so waiting for the row to be
    // present and stable, rather than changing the component, is correct.
    const row = await canvas.findByText("Old · PLN");
    await waitFor(() => {
      if (getComputedStyle(row).opacity !== "1") throw new Error("row still settling");
    });
  },
};

/** `EmptyState(first-run)` — S16 §6, reachable directly from the tab bar. */
export const Empty: Story = { args: { accounts: [], archivedAccounts: [] } };
