/**
 * `TransactionRow` — the densest thing in the app and the one rendered most.
 *
 * A ledger is read as a **column**, not as a set of rows, so the stories below
 * are all multi-row: a single row in isolation cannot show the two properties
 * that decide whether the component works — whether the figures align, and
 * whether the eye can find the entered name without reading the metadata first.
 *
 * Every list reaches it through `EntryRow`, which draws a transfer with both
 * legs as a `TransferRow` instead — so the transfer here is a single leg, the
 * shape a row with only one side takes. Today's pages draw rows without their
 * date (the day header says it); S10's ledger and a counterparty's history
 * keep it. The desk ledger is a table and does not use this component.
 *
 * The cases are the ones that have been wrong: a transfer leg, which sign
 * alone would paint green or red; a business row, which `05` §5.2 requires to
 * be marked in every view; a missing entered name, which imports routinely
 * produce; and a name longer than the row.
 */

import type { Meta, StoryObj } from "@storybook/react-native-web-vite";
import * as money from "@waltning/core/money";
import { View } from "react-native";
import { makeStyles } from "../../../theme/styles.ts";
import { radius, space } from "../../../tokens.ts";
import { TransactionRow, type TransactionRowProps } from "./transaction-row";

const meta = {
  title: "Transactions/TransactionRow",
  component: TransactionRow,
  args: {
    date: "2026-08-24",
    enteredName: "Corner Bakery",
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

/** `SPEC.md` §14.4b — recognised offline, never blank for an unmatched entered name. */
export const RecognisedBrand: Story = {
  args: { enteredName: "ORLEN", brandKey: "orlen" },
};

export const UnrecognisedBrand: Story = {
  args: { enteredName: "Corner Café", brandKey: null },
};

/**
 * The dated column, as S10's ledger and a counterparty's history draw it. This
 * is the story that shows whether the
 * figures line up — and whether the *identity* column does too: every row
 * reaches this component through `EntryRow` with `brandKey` read, `null`
 * included — a read never omits the field, it only sometimes resolves to
 * nothing. A `LEDGER` row that left `brandKey`
 * absent pinned a column no screen produces: six rows starting flush left
 * and one 24px further right, certified as correct by a baseline nothing in
 * the app can reproduce.
 */
export const Ledger: Story = {
  render: renderLedger,
};

/**
 * Today's column: no date on any row — the day header above says it, and a
 * date on every row was the repetition `DayGroup` exists to remove. No other
 * story drew a row this way, though every one of Today's pages does.
 */
export const TodayColumn: Story = { render: renderTodayColumn };

/**
 * An obligation's role, as a counterparty's history names it: a contribution
 * is money a person put into a shared account (SPEC §6.6).
 */
export const WithRoleTag: Story = {
  args: {
    enteredName: "Friend A",
    category: null,
    account: "Shared A",
    amount: money.toMoney("300.00"),
    type: "income",
    roleTag: "contribution",
  },
};

/** A name and category longer than the row: they truncate, the figure never does. */
export const LongText: Story = {
  args: {
    enteredName: "Restaurant with a very long name on the Old Town square",
    category: "Friends & going out",
    account: "Card A",
    withDate: false,
  },
};

/** A foreign-currency row keeps its own currency; the list never converts a row in place. */
export const ForeignCurrency: Story = {
  args: {
    enteredName: "Hotel A",
    category: "Accommodation",
    amount: money.toMoney("-95.00"),
    currency: "EUR",
    withDate: false,
  },
};

/** Tappable, as every list row is: the whole row is the target. */
export const Tappable: Story = { args: { onPress: noop, withDate: false } };

function noop() {}

const LEDGER: TransactionRowProps[] = [
  {
    date: "2026-08-24",
    enteredName: "Corner Bakery",
    category: "Eating out",
    account: "Cash",
    amount: money.toMoney("-48.90"),
    currency: "PLN",
    type: "expense",
    brandKey: null,
  },
  {
    date: "2026-08-24",
    enteredName: "ORLEN",
    category: "Transport",
    account: "Cash",
    amount: money.toMoney("-184.30"),
    currency: "PLN",
    type: "expense",
    brandKey: "orlen",
  },
  {
    date: "2026-08-24",
    enteredName: "Monthly invoice",
    category: "Consulting",
    account: "Bank A",
    amount: money.toMoney("9400.00"),
    currency: "PLN",
    type: "income",
    isBusiness: true,
    brandKey: null,
  },
  {
    date: "2026-08-23",
    enteredName: "To savings",
    category: null,
    account: "Bank A",
    amount: money.toMoney("-1200.00"),
    currency: "PLN",
    type: "transfer",
    brandKey: null,
  },
  {
    date: "2026-08-22",
    enteredName: "",
    category: "Uncategorised",
    account: "Bank A",
    amount: money.toMoney("-7.25"),
    currency: "PLN",
    type: "expense",
    brandKey: null,
  },
  {
    date: "2026-08-21",
    enteredName: "Opening balance",
    category: null,
    account: "Savings",
    amount: money.toMoney("12480.20"),
    currency: "PLN",
    type: "adjustment",
    brandKey: null,
  },
];

function renderLedger() {
  return <Surface>{LEDGER.map(renderRow)}</Surface>;
}

function renderTodayColumn() {
  return <Surface>{LEDGER.map(renderTodayRow)}</Surface>;
}

function renderTodayRow(row: TransactionRowProps) {
  return (
    <TransactionRow
      key={`${row.date}-${row.enteredName}-${row.account}`}
      {...row}
      withDate={false}
    />
  );
}

function renderRow(row: TransactionRowProps) {
  return <TransactionRow key={`${row.date}-${row.enteredName}-${row.account}`} {...row} />;
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
