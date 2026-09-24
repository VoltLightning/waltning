/**
 * A day as a unit: the date and its total outside, the rows inside. The header
 * sits on the ground because a date divides two days rather than titling one.
 *
 * Composed the way Today composes it (`today-screen.tsx`'s recent days): rows
 * are `LedgerRowItem` **without their date** — the header says it once, and a
 * date on every row was the repetition this component exists to remove — and
 * the total is `kind="net"`, so a day that came out ahead is green and a day
 * of your own transfers is muted.
 */

import type { Meta, StoryObj } from "@storybook/react-native-web-vite";
import { currencyCode, toMoney } from "@waltning/core/money";
import { Amount } from "../../../fx/atoms/amount/amount";
import type { LedgerEntry } from "../entry-row/ledger-entry.ts";
import { LedgerRowItem } from "../ledger-row-item/ledger-row-item";
import { DayGroup } from "./day-group";

const PLN = currencyCode("PLN");

function noop() {}

function row(id: string, overrides: Partial<LedgerEntry>): LedgerEntry {
  return {
    id,
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
    ...overrides,
  };
}

const MARKET = row("t1", {});
const TRAM = row("t2", {
  enteredName: "Tram pass",
  categoryName: "Transport",
  accountName: "Cash",
  amount: toMoney("-45.00"),
});

function total(value: string) {
  return <Amount value={toMoney(value)} currency={PLN} decimals={2} size="compact" kind="net" />;
}

function rows(entries: readonly LedgerEntry[]) {
  return entries.map((entry) => (
    <LedgerRowItem key={entry.id} row={entry} withDate={false} onPress={noop} />
  ));
}

const meta = {
  title: "Transactions/DayGroup",
  component: DayGroup,
  args: {
    label: "Thursday 10 September",
    total: total("-169.50"),
    children: rows([MARKET, TRAM]),
  },
} satisfies Meta<typeof DayGroup>;

export default meta;
type Story = StoryObj<typeof meta>;

export const ADay: Story = {};

/** One row is still a day. The surface is what says so. */
export const OneRow: Story = { args: { total: total("-124.50"), children: rows([MARKET]) } };

/**
 * A mixed day: salary, a business row, a friend's contribution to a shared
 * account, and a transfer between your own accounts (whose two legs cancel).
 * It came out ahead, so its total is green.
 */
export const MixedDay: Story = {
  args: {
    label: "Friday 11 September",
    total: total("6435.50"),
    children: rows([
      row("t3", {
        type: "income",
        enteredName: "Employer A",
        categoryName: "Salary",
        amount: toMoney("6200.00"),
      }),
      row("t4", {
        enteredName: "Printer paper",
        categoryName: "Business other",
        isBusiness: true,
        amount: toMoney("-64.50"),
      }),
      row("t5", {
        type: "income",
        enteredName: "Friend A",
        categoryName: null,
        accountName: "Shared A",
        amount: toMoney("300.00"),
        obligationRole: "contribution",
      }),
      row("t6", {
        type: "transfer",
        enteredName: "",
        categoryName: null,
        toAccountName: "Savings",
        amount: toMoney("-1000.00"),
        toAmount: toMoney("1000.00"),
        toCurrency: PLN,
        toDecimals: 2,
      }),
    ]),
  },
};

/** A day of only your own transfers: nothing gained or lost, so the total is muted. */
export const OnlyTransfers: Story = {
  args: {
    total: total("0"),
    children: rows([
      row("t7", {
        type: "transfer",
        enteredName: "",
        categoryName: null,
        toAccountName: "Savings",
        amount: toMoney("-500.00"),
        toAmount: toMoney("500.00"),
        toCurrency: PLN,
        toDecimals: 2,
      }),
    ]),
  },
};

/**
 * No total: a day the ledger could not price (a leg with no rate) states no
 * figure rather than a wrong one — Today passes none.
 */
export const NoTotal: Story = { args: { total: undefined } };
