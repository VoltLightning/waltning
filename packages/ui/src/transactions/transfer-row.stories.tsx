/**
 * `TransferRow` — S10 §8: one row for a transfer, never two.
 *
 * The `Ledger` story is `TransactionRow`'s own mixed-list case, replayed with
 * `TransferRow` in place of the two separate legs — the fix S10 exists to
 * enforce, shown beside the expense/income rows it sits among on a real
 * screen.
 */

import type { Meta, StoryObj } from "@storybook/react-native-web-vite";
import * as money from "@waltning/core/money";
import { View } from "react-native";
import { makeStyles } from "../theme/styles.ts";
import { hairline, radius, space } from "../tokens.ts";
import { TransactionRow } from "./transaction-row";
import { TransferRow } from "./transfer-row";

const meta = {
  title: "Transactions/TransferRow",
  component: TransferRow,
  args: {
    date: "2026-08-23",
    fromAccountName: "Cash",
    toAccountName: "Bank A",
    amount: money.toMoney("-500.00"),
    currency: "PLN",
    decimals: 2,
    toAmount: money.toMoney("500.00"),
    toCurrency: "PLN",
    toDecimals: 2,
  },
} satisfies Meta<typeof TransferRow>;

export default meta;
type Story = StoryObj<typeof meta>;

export const SameCurrency: Story = {};

/** `4a`'s FX margin — a transfer whose two legs are two different currencies. */
export const CrossCurrency: Story = {
  args: {
    fromAccountName: "Bank A · PLN",
    toAccountName: "Wallet · USD",
    amount: money.toMoney("-125.00"),
    currency: "PLN",
    toAmount: money.toMoney("31.25"),
    toCurrency: "USD",
  },
};

export const Ledger: Story = {
  render: LedgerDemo,
};

function LedgerDemo() {
  const styles = useStyles();
  return (
    <View style={styles.surface}>
      <TransactionRow
        date="2026-08-24"
        payee="Corner Bakery"
        category="Eating out"
        account="Cash"
        amount={money.toMoney("-48.90")}
        currency="PLN"
        type="expense"
      />
      <View style={styles.separated}>
        <TransferRow
          date="2026-08-23"
          fromAccountName="Cash"
          toAccountName="Bank A"
          amount={money.toMoney("-1200.00")}
          currency="PLN"
          toAmount={money.toMoney("1200.00")}
          toCurrency="PLN"
        />
      </View>
      <View style={styles.separated}>
        <TransactionRow
          date="2026-08-22"
          payee="Monthly invoice"
          category="Consulting"
          account="Bank A"
          amount={money.toMoney("9400.00")}
          currency="PLN"
          type="income"
          isBusiness
        />
      </View>
    </View>
  );
}

const useStyles = makeStyles((theme) => ({
  surface: {
    backgroundColor: theme.surface,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: theme.border,
    padding: space.x5,
  },
  separated: { borderTopWidth: hairline.width, borderTopColor: theme.hairline },
}));
