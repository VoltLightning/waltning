/**
 * A day as a unit: the date and its total outside, the rows inside. The header
 * sits on the ground because a date divides two days rather than titling one.
 */

import type { Meta, StoryObj } from "@storybook/react-native-web-vite";
import { currencyCode, toMoney } from "@waltning/core/money";
import { Amount } from "../../../fx/atoms/amount/amount";
import { EntryRow, type LedgerEntry } from "../entry-row/entry-row";
import { DayGroup } from "./day-group";

const PLN = currencyCode("PLN");

function noop() {}

const ROWS: LedgerEntry[] = [
  {
    id: "t1",
    date: "2026-09-10",
    type: "expense",
    payee: "Market B",
    categoryName: "Groceries",
    accountName: "Bank A",
    amount: toMoney("-124.50"),
    currency: PLN,
    decimals: 2,
    isBusiness: false,
    brandKey: null,
  },
  {
    id: "t2",
    date: "2026-09-10",
    type: "expense",
    payee: "Tram pass",
    categoryName: "Transport",
    accountName: "Cash",
    amount: toMoney("-45.00"),
    currency: PLN,
    decimals: 2,
    isBusiness: false,
    brandKey: null,
  },
];

const meta = {
  title: "Transactions/DayGroup",
  component: DayGroup,
  args: {
    label: "Thursday 10 September",
    total: (
      <Amount
        value={toMoney("-169.50")}
        currency={PLN}
        decimals={2}
        size="compact"
        emphasis="muted"
      />
    ),
    children: ROWS.map((row) => <EntryRow key={row.id} row={row} onPress={noop} />),
  },
} satisfies Meta<typeof DayGroup>;

export default meta;
type Story = StoryObj<typeof meta>;

export const ADay: Story = {};

/** One row is still a day. The surface is what says so. */
export const OneRow: Story = {
  args: { children: <EntryRow row={ROWS[0] as LedgerEntry} onPress={noop} /> },
};

/**
 * A filtered day has no figure of its own to state (S04 §7) — the rows on
 * screen are a subset a query chose, so their sum is not the day's own.
 */
export const Filtered: Story = { args: { total: undefined } };
