/**
 * `LedgerRowItem` — a ledger row as Today and the ledger draw it: an
 * `EntryRow` without its date (the day header says it), inside a swipe
 * surface when both swipes are wired and the row is income or spend. A
 * transfer or an adjustment never swipes: neither has a category to set.
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
  args: { row: EXPENSE, onPress: noop, withDate: false },
} satisfies Meta<typeof LedgerRowItem>;

export default meta;
type Story = StoryObj<typeof meta>;

/** Tap only — no swipes wired, so no swipe surface. */
export const TapOnly: Story = {};

/** Both swipes wired: the same row at rest inside its swipe surface. */
export const Swipeable: Story = { args: { onShortSwipe: noop, onLongSwipe: noop } };

/** A transfer never swipes, even with both handlers wired. */
export const Transfer: Story = { args: { row: TRANSFER, onShortSwipe: noop, onLongSwipe: noop } };
