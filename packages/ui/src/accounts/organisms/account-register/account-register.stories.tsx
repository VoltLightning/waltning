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

/** The display currency — the one the register states its totals in. */
const PIVOT = { currency: "PLN", decimals: 2 };

/**
 * **Several accounts per kind, and more than one currency**, because one
 * account per kind is the shape in which every layout looks fine: it is the
 * runs of rows that the rules, the marks and the subtotals are all for.
 * Invented names, never the ledger's (`CLAUDE.md`) — and not named after their
 * own kind, which S16 §3 asks of a register and the old fixture ignored.
 */
export const POPULATED: readonly AccountRegisterAccount[] = [
  account({
    id: "bank-1",
    name: "Everyday",
    kind: "bank",
    balance: money.toMoney("6200"),
    pivotBalance: money.toMoney("6200"),
  }),
  account({
    id: "bank-2",
    name: "Studio",
    kind: "bank",
    balance: money.toMoney("2220.10"),
    pivotBalance: money.toMoney("2220.10"),
    isBusiness: true,
  }),
  account({
    id: "bank-3",
    name: "Abroad",
    kind: "bank",
    currency: "EUR",
    balance: money.toMoney("3140"),
    pivotBalance: money.toMoney("13391.76"),
  }),
  account({
    id: "cash-1",
    name: "Wallet",
    kind: "cash",
    balance: money.toMoney("840"),
    pivotBalance: money.toMoney("840"),
  }),
  account({
    id: "cash-2",
    name: "Travel float",
    kind: "cash",
    currency: "EUR",
    balance: money.toMoney("210"),
    pivotBalance: money.toMoney("895.44"),
  }),
  account({
    id: "card-1",
    name: "Card A",
    kind: "card",
    currency: "EUR",
    balance: money.toMoney("-2096.90"),
    pivotBalance: money.toMoney("-8941.18"),
  }),
  account({
    id: "card-2",
    name: "Card B",
    kind: "card",
    currency: "EUR",
    balance: money.toMoney("-418.30"),
    pivotBalance: money.toMoney("-1783.63"),
  }),
  account({
    id: "invest-1",
    name: "Brokerage",
    kind: "investment",
    balance: money.toMoney("31200"),
    pivotBalance: money.toMoney("31200"),
  }),
  account({
    id: "clearing-1",
    name: "Unallocated",
    kind: "clearing",
    balance: money.toMoney("340"),
    pivotBalance: money.toMoney("340"),
  }),
  /**
   * **The kind that exists so nothing has to be filed as a lie**, and a second
   * deposit so that section is a run rather than a single row.
   */
  account({
    id: "other-1",
    name: "Travel card",
    kind: "other",
    currency: "EUR",
    balance: money.toMoney("120"),
    pivotBalance: money.toMoney("518.40"),
  }),
  account({
    id: "deposit-1",
    name: "Rainy day",
    kind: "deposit",
    balance: money.toMoney("9000"),
    pivotBalance: money.toMoney("9000"),
  }),
  /**
   * **Both loan directions, and both signs.** The register sorts these two
   * last and draws money owed to you positive and money you owe negative —
   * neither of which a story could show while no loan account existed. These
   * are also the only rows here that carry a negative pivot figure, so they
   * are what proves the money colours and the subtotal's own sign.
   */
  account({
    id: "loan-out-1",
    name: "Lent to a friend",
    kind: "loan_receivable",
    balance: money.toMoney("4000"),
    pivotBalance: money.toMoney("4000"),
  }),
  account({
    id: "loan-in-1",
    name: "Car loan",
    kind: "loan_payable",
    balance: money.toMoney("-18000"),
    pivotBalance: money.toMoney("-18000"),
  }),
  account({
    id: "loan-in-2",
    name: "Renovation",
    kind: "loan_payable",
    currency: "EUR",
    balance: money.toMoney("-2400"),
    pivotBalance: money.toMoney("-10368"),
  }),
];

const SHARED: readonly AccountRegisterAccount[] = [
  ...POPULATED,
  account({
    id: "shared-1",
    name: "Household",
    kind: "deposit",
    ownership: "shared",
    currency: "USD",
    balance: money.toMoney("1800"),
    pivotBalance: money.toMoney("6460.40"),
  }),
];

const ARCHIVED: readonly AccountRegisterAccount[] = [
  account({ id: "old-1", name: "Closed savings", kind: "bank", balance: money.toMoney("0") }),
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
    pivot: PIVOT,
  },
} satisfies Meta<typeof AccountRegister>;

export default meta;
type Story = StoryObj<typeof meta>;

/** Grouped by kind, a rule between every account, the total above — the ordinary state. */
export const Populated: Story = {};

/** A shared account, apart and at the same weight, never inside a kind group. */
export const WithShared: Story = { args: { accounts: SHARED } };

/** The toggle open — archived accounts, muted, with their own count. */
export const WithArchived: Story = {
  args: { accounts: POPULATED, archivedAccounts: ARCHIVED, archivedLoaded: true },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const toggle = await canvas.findByRole("button", { name: "Archived" });
    await userEvent.click(toggle);
    await canvas.findByText("Closed savings");
    // The row mounts the instant `archivedOpen` flips and carries no
    // opacity or transform of its own — `ArchivedToggle`'s own comment: a
    // whole-row fade failed `axe`'s contrast check here. What is still
    // settling is the *toggle button's* own `usePressScale` (`press-scale.ts`)
    // easing its `scale` back to 1 after release, on the `Animated.View`
    // that wraps it (`button.tsx`) — a screenshot taken mid-settle catches
    // the button a hair smaller than its resting size.
    const wrapper = toggle.parentElement;
    await waitFor(() => {
      if (wrapper === null) throw new Error("button has no Animated.View wrapper");
      const { transform } = getComputedStyle(wrapper);
      if (transform !== "none" && transform !== "matrix(1, 0, 0, 1, 0, 0)") {
        throw new Error("press-scale still settling");
      }
    });
  },
};

/**
 * The toggle open with nothing behind it. The rows load lazily, so a register
 * cannot hide the heading in advance — it opens and says what it found.
 */
export const ArchivedEmpty: Story = {
  args: { accounts: POPULATED, archivedAccounts: [], archivedLoaded: true },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const toggle = await canvas.findByRole("button", { name: "Archived" });
    await userEvent.click(toggle);
    await canvas.findByText("No archived accounts.");
    // The same `usePressScale` settle `WithArchived` waits out — see there.
    const wrapper = toggle.parentElement;
    await waitFor(() => {
      if (wrapper === null) throw new Error("button has no Animated.View wrapper");
      const { transform } = getComputedStyle(wrapper);
      if (transform !== "none" && transform !== "matrix(1, 0, 0, 1, 0, 0)") {
        throw new Error("press-scale still settling");
      }
    });
  },
};

/** `EmptyState(first-run)` — S16 §6, reachable directly from the tab bar. */
export const Empty: Story = { args: { accounts: [], archivedAccounts: [] } };
