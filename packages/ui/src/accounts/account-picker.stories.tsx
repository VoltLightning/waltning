/**
 * `AccountPicker` — the owner's own words: *"the list of accounts in AddForm
 * will be like 20 items long… I think we need to use a grid there."*
 * `TwentyAccounts` is the worked case; the others are the scenarios S05 and
 * S16 name.
 */

import type { Meta, StoryObj } from "@storybook/react-native-web-vite";
import { toMoney } from "@waltning/core/money";
import { expect, userEvent, within } from "storybook/test";
import {
  AccountPicker,
  type AccountPickerAccount,
  type AccountPickerGroup,
} from "./account-picker";

function noop() {}

const GROUPS: AccountPickerGroup[] = [
  { id: "grp-bank", name: "BANK" },
  { id: "grp-cash", name: "CASH" },
  { id: "grp-savings", name: "SAVINGS" },
  { id: "grp-shared", name: "SHARED" },
];

const FEW: AccountPickerAccount[] = [
  {
    id: "acc-cash-pln",
    name: "Cash · PLN",
    currency: "PLN",
    decimals: 2,
    kind: "cash",
    capturable: true,
    ownership: "own",
    groupId: "grp-cash",
    balance: toMoney("840"),
  },
  {
    id: "acc-bank-pln",
    name: "Bank A · PLN",
    currency: "PLN",
    decimals: 2,
    kind: "bank",
    capturable: true,
    ownership: "own",
    groupId: "grp-bank",
    balance: toMoney("6200"),
  },
  {
    id: "acc-bank-eur",
    name: "Bank A · EUR",
    currency: "EUR",
    decimals: 2,
    kind: "bank",
    capturable: true,
    ownership: "own",
    groupId: "grp-bank",
    balance: toMoney("340"),
  },
];

/** Twenty accounts, spread across four groups — the worked example the owner asked for. */
const TWENTY: AccountPickerAccount[] = [
  ...FEW,
  {
    id: "acc-savings-usd",
    name: "Savings · USD",
    currency: "USD",
    decimals: 2,
    kind: "deposit",
    capturable: true,
    ownership: "own",
    groupId: "grp-savings",
    balance: toMoney("12400"),
  },
  {
    id: "acc-joint-pln",
    name: "Joint · PLN",
    currency: "PLN",
    decimals: 2,
    kind: "bank",
    capturable: true,
    ownership: "shared",
    groupId: "grp-shared",
    balance: toMoney("6460.40"),
  },
  {
    id: "acc-card-pln",
    name: "Bank A card · PLN",
    currency: "PLN",
    decimals: 2,
    kind: "card",
    capturable: true,
    ownership: "own",
    groupId: "grp-bank",
    balance: toMoney("-412.30"),
  },
  {
    id: "acc-cash-byn",
    name: "Cash · BYN",
    currency: "BYN",
    decimals: 2,
    kind: "cash",
    capturable: false,
    ownership: "own",
    groupId: "grp-cash",
  },
  {
    id: "acc-clearing-pln",
    name: "Clearing · PLN",
    currency: "PLN",
    decimals: 2,
    kind: "clearing",
    capturable: true,
    ownership: "own",
    groupId: null,
    balance: toMoney("340"),
  },
  ...Array.from({ length: 12 }, (_, i) => ({
    id: `acc-extra-${i}`,
    name: `Household ${i + 1} · PLN`,
    currency: "PLN",
    decimals: 2,
    kind: "other" as const,
    capturable: true,
    ownership: "own" as const,
    groupId: i % 2 === 0 ? "grp-bank" : "grp-savings",
    balance: toMoney(String(100 * (i + 1))),
  })),
];

const meta = {
  title: "Accounts/AccountPicker",
  component: AccountPicker,
  args: {
    visible: true,
    accounts: FEW,
    groups: GROUPS,
    accountId: null,
    onPick: noop,
    onCreateAccount: noop,
    onDismiss: noop,
  },
  parameters: { layout: "fullscreen" },
} satisfies Meta<typeof AccountPicker>;

export default meta;
type Story = StoryObj<typeof meta>;

/** Three accounts — no `SearchField`, the ordinary small-ledger case. */
export const FewAccounts: Story = {};

/** Twenty accounts, four groups — the grid the owner asked for. */
export const TwentyAccounts: Story = { args: { accounts: TWENTY } };

/** Live filtering, folded — the same rule `CategorySheet`'s own search keeps. */
export const Searching: Story = {
  args: { accounts: TWENTY },
  play: async ({ canvasElement }) => {
    // `<Modal>` (`shell/bottom-sheet.tsx`) portals its content to a sibling of
    // `canvasElement` on the web — `category-sheet.stories.tsx`'s own reason.
    const canvas = within(canvasElement.ownerDocument.body);
    await userEvent.type(await canvas.findByLabelText(/Search \d+ accounts/), "joint");
    await expect(canvas.findByRole("radio", { name: "Joint · PLN" })).resolves.toBeDefined();
  },
};

/** The account chip's own last-used window (S05 §9.2) — one row, machine-filled, above the groups. */
export const WithLastUsed: Story = {
  args: {
    accounts: TWENTY,
    lastUsedId: "acc-bank-pln",
    lastUsedAt: new Date("2026-09-03T14:20:00Z").getTime(),
  },
};

/**
 * No rate held for BYN — shown, muted, and it says why rather than
 * disappearing (S05). `TWENTY`'s own BYN tile sits in the CASH group, below
 * the list's `maxHeight` scroll cut, so its baseline was indistinguishable
 * from `TwentyAccounts`; this fixture is four accounts total — no scroll cut
 * to clear — so the tile and its "needs a rate" caption land inside the
 * captured frame regardless of which group it sits in.
 */
const UNCAPTURABLE: AccountPickerAccount[] = [
  {
    id: "acc-cash-byn",
    name: "Cash · BYN",
    currency: "BYN",
    decimals: 2,
    kind: "cash",
    capturable: false,
    ownership: "own",
    groupId: "grp-cash",
  },
  ...FEW,
];

export const Uncapturable: Story = {
  args: { accounts: UNCAPTURABLE, groups: GROUPS },
};
