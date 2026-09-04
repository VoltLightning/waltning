/**
 * `<SettleSheet>` — S14 §6, §9: entering, partial, exact, over-settlement,
 * stamped (offline, older than the session), and no reference held at all.
 *
 * Fully controlled (see the file's own doc): every story is a set of props,
 * not a sequence of taps — the same reason `QuickAddComposer`'s own stories
 * work this way.
 */

import type { Meta, StoryObj } from "@storybook/react-native-web-vite";
import { pivotPerUnit, toMoney } from "@waltning/core/money";
import { SettleSheet } from "./settle-sheet";

function noop() {}

const meta = {
  title: "Counterparties/SettleSheet",
  component: SettleSheet,
  args: {
    visible: true,
    counterpartyName: "Nina",
    balances: [{ currency: "EUR", balance: toMoney("-120"), decimals: 2 }],
    accounts: [{ id: "acc-cash-pln", name: "Cash · PLN", currency: "PLN", capturable: true }],
    amountRaw: "",
    dischargesCurrency: "EUR",
    onDischargesCurrencyChange: noop,
    dischargesRaw: "",
    activeField: "amount",
    onActiveFieldChange: noop,
    accountId: "acc-cash-pln",
    onOpenAccountPicker: noop,
    referenceRate: { rate: pivotPerUnit("4.3120"), source: "nbp", date: "2026-08-10" },
    note: "",
    onNoteChange: noop,
    stale: false,
    keypad: null,
    onDismiss: noop,
    onSettle: noop,
  },
  parameters: { layout: "fullscreen" },
} satisfies Meta<typeof SettleSheet>;

export default meta;
type Story = StoryObj<typeof meta>;

/** Nothing typed yet — the ordinary open state. */
export const Entering: Story = {};

/** The E5 plan's own worked example: owe 120 EUR, settle 50 — residual −70, spread against 4.3120. */
export const Partial: Story = {
  args: { amountRaw: "214,05", dischargesRaw: "50" },
};

/** Discharging the whole open balance — the residual reads zero. */
export const Exact: Story = {
  args: { amountRaw: "513,72", dischargesRaw: "120" },
};

/** Paying more than owed — a state, not an error (S14 §9.2). */
export const OverSettlement: Story = {
  args: { amountRaw: "642,15", dischargesRaw: "150" },
};

/** Offline, past the session's own checkpoint — every row and the result card say so. */
export const Stamped: Story = {
  args: {
    amountRaw: "214,05",
    dischargesRaw: "50",
    stale: true,
    stampedAt: new Date("2026-08-12T14:20:00Z").getTime(),
  },
};

/** Nothing held for this pair — the reference line is simply absent. */
export const NoRate: Story = {
  args: { amountRaw: "214,05", dischargesRaw: "50", referenceRate: undefined },
};

/** Two open balances — a real choice, not a fact stated in place. */
export const MultipleBalances: Story = {
  args: {
    balances: [
      { currency: "EUR", balance: toMoney("-120"), decimals: 2 },
      { currency: "GBP", balance: toMoney("60"), decimals: 2 },
    ],
  },
};

/** L3 — every held balance is dust at its own currency's scale (M1's own filter, empty): nothing here for Settle to discharge, and Settle itself stays disabled. */
export const NothingToSettle: Story = {
  args: {
    balances: [{ currency: "EUR", balance: toMoney("0.004"), decimals: 2 }],
    dischargesCurrency: null,
    referenceRate: undefined,
  },
};
