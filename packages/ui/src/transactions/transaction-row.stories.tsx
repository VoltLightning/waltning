/**
 * `TransactionRow` — the densest thing in the app and the one rendered most.
 *
 * A ledger is read as a **column**, not as a set of rows, so the stories below
 * are all multi-row: a single row in isolation cannot show the two properties
 * that decide whether the component works — whether the figures align, and
 * whether the eye can find the payee without reading the metadata first.
 *
 * The cases are the ones that have been wrong: a transfer's two legs, which
 * sign alone would paint green and red; a business row, which `05` §5.2
 * requires to be marked in every view; and a missing payee, which imports
 * routinely produce.
 */

import type { Meta, StoryObj } from "@storybook/react-native-web-vite";
import * as money from "@waltning/core/money";
import { View } from "react-native";
import { makeStyles } from "../theme/styles.ts";
import { radius, space } from "../tokens.ts";
import { TransactionRow, type TransactionRowProps } from "./transaction-row";

const meta = {
  title: "Transactions/TransactionRow",
  component: TransactionRow,
  args: {
    date: "2026-08-24",
    payee: "Corner Bakery",
    category: "Eating out",
    account: "Cash",
    amount: money.toMoney("-48.90"),
    currency: "PLN",
    decimals: 2,
    type: "expense",
  },
} satisfies Meta<typeof TransactionRow>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Expense: Story = {};

/** `SPEC.md` §14.4b — recognised offline, never blank for an unmatched payee. */
export const RecognisedBrand: Story = {
  args: { payee: "ORLEN", brandKey: "orlen" },
};

export const UnrecognisedBrand: Story = {
  args: { payee: "Corner Café", brandKey: null },
};

/** The column. This is the story that shows whether the figures line up. */
export const Ledger: Story = {
  render: renderLedger,
};

const LEDGER: TransactionRowProps[] = [
  {
    date: "2026-08-24",
    payee: "Corner Bakery",
    category: "Eating out",
    account: "Cash",
    amount: money.toMoney("-48.90"),
    currency: "PLN",
    type: "expense",
  },
  {
    date: "2026-08-24",
    payee: "ORLEN",
    category: "Transport",
    account: "Cash",
    amount: money.toMoney("-184.30"),
    currency: "PLN",
    type: "expense",
    brandKey: "orlen",
  },
  {
    date: "2026-08-24",
    payee: "Monthly invoice",
    category: "Consulting",
    account: "Bank A",
    amount: money.toMoney("9400.00"),
    currency: "PLN",
    type: "income",
    isBusiness: true,
  },
  {
    date: "2026-08-23",
    payee: "To savings",
    category: null,
    account: "Bank A",
    amount: money.toMoney("-1200.00"),
    currency: "PLN",
    type: "transfer",
  },
  {
    date: "2026-08-23",
    payee: "To savings",
    category: null,
    account: "Savings",
    amount: money.toMoney("1200.00"),
    currency: "PLN",
    type: "transfer",
  },
  {
    date: "2026-08-22",
    payee: "",
    category: "Uncategorised",
    account: "Bank A",
    amount: money.toMoney("-7.25"),
    currency: "PLN",
    type: "expense",
  },
  {
    date: "2026-08-21",
    payee: "Opening balance",
    category: null,
    account: "Savings",
    amount: money.toMoney("12480.20"),
    currency: "PLN",
    type: "adjustment",
  },
];

function renderLedger() {
  return <Surface>{LEDGER.map(renderRow)}</Surface>;
}

function renderRow(row: TransactionRowProps) {
  return <TransactionRow key={`${row.date}-${row.payee}-${row.account}`} {...row} />;
}

function Surface({ children }: { children: React.ReactNode }) {
  const styles = useStyles();
  return <View style={styles.surface}>{children}</View>;
}

const useStyles = makeStyles((theme) => ({
  surface: {
    backgroundColor: theme.surface,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: theme.border,
    padding: space.x5,
  },
}));
