/**
 * `ReconcileSheet` — S16 §5, *"I counted, and it says this."*
 */

import type { Meta, StoryObj } from "@storybook/react-native-web-vite";
import * as money from "@waltning/core/money";
import { userEvent, within } from "storybook/test";
import { ReconcileSheet } from "./reconcile-sheet";

function noop() {}

const meta = {
  title: "Accounts/ReconcileSheet",
  component: ReconcileSheet,
  args: {
    visible: true,
    accountName: "Bank A · PLN",
    currency: "PLN",
    computedBalance: money.toMoney("1240.50"),
    asOf: "2026-08-24",
    onAsOfChange: noop,
    today: "2026-08-24",
    onDismiss: noop,
    onSave: noop,
  },
} satisfies Meta<typeof ReconcileSheet>;

export default meta;
type Story = StoryObj<typeof meta>;

/** Computed, observed, and the live difference — S16 §5's worked example. */
export const Reconcile: Story = {
  play: async ({ canvasElement }) => {
    await userEvent.type(await within(canvasElement).findByLabelText("You observed"), "1198,30");
  },
};

/** A zero-difference refusal, landed on the field that caused it. */
export const NothingToReconcile: Story = {
  args: {
    fieldErrors: {
      byField: { observedBalance: ["The ledger already shows this balance."] },
      formLevel: [],
    },
  },
};
