/**
 * `LedgerRowItem` — a ledger row answering a tap. Rows do not swipe (S10 §7).
 * S10's ledger keeps each row's date; Today's pages drop it, because their
 * day header says it.
 */

import type { Meta, StoryObj } from "@storybook/react-native-web-vite";
import { currencyCode, toMoney } from "@waltning/core/money";
import type { LedgerEntry } from "../entry-row/ledger-entry.ts";
import { LedgerRowItem } from "./ledger-row-item";

const PLN = currencyCode("PLN");

function noop() {}

const EXPENSE: LedgerEntry = {
  id: "t1",
  date: "2026-09-10",
  type: "expense",
  enteredName: "Market B",
  categoryName: "Groceries",
  accountName: "Bank A",
  amount: toMoney("-124.50"),
  currency: PLN,
  decimals: 2,
  isBusiness: false,
  brandKey: null,
};

const TRANSFER: LedgerEntry = {
  ...EXPENSE,
  id: "t2",
  type: "transfer",
  enteredName: "",
  categoryName: null,
  accountName: "Bank A",
  toAccountName: "Savings",
  amount: toMoney("-500.00"),
  toAmount: toMoney("500.00"),
  toCurrency: PLN,
  toDecimals: 2,
};

const meta = {
  title: "Transactions/LedgerRowItem",
  component: LedgerRowItem,
  args: { row: EXPENSE, onPress: noop },
} satisfies Meta<typeof LedgerRowItem>;

export default meta;
type Story = StoryObj<typeof meta>;

/** As S10's ledger draws it: dated. */
export const InTheLedger: Story = {};

/** As Today draws it: no date. */
export const OnToday: Story = { args: { withDate: false } };

/** A transfer: one row for both legs. */
export const Transfer: Story = { args: { row: TRANSFER } };
