/**
 * `<TransactionList>` — the column `design-system/05` §5.2 describes and never
 * had a component for.
 *
 * **A ledger is read as a column, not as a set of rows**, and the two
 * properties that decides — where the separators fall, and what an empty
 * ledger says — belong to whoever knows how many rows there are. Every screen
 * mapped over the data itself, so the row drew its own bottom hairline and the
 * last one in every card was a rule under nothing.
 *
 * A separator is a property of the *gap between two rows*, so it is drawn on
 * the top of every row after the first. React Native has no `:not(:first-
 * child)`; this is the structure that expresses it.
 *
 * Takes data rather than children. The alternative — `React.Children.map` over
 * whatever a screen passed — cannot tell a row from a heading, so the day a
 * screen puts anything else in the list the separators land in the wrong
 * places and nothing says so.
 */

import { View } from "react-native";
import { makeStyles } from "../theme/styles.ts";
import { hairline } from "../tokens.ts";
import { TransactionRow, type TransactionRowProps } from "./transaction-row";

/** The row's props plus the ledger's own id, which is the key. */
export type TransactionListItem = TransactionRowProps & { id: string };

export type TransactionListProps = {
  transactions: readonly TransactionListItem[];
};

export function TransactionList({ transactions }: TransactionListProps) {
  const styles = useStyles();

  return (
    <View>
      {transactions.map(({ id, ...row }, index) => (
        // `id` is destructured off rather than spread through: it is the
        // list's key, and a row that receives it would be a row that could
        // start using it.
        <View key={id} style={index === 0 ? null : styles.separated}>
          <TransactionRow {...row} />
        </View>
      ))}
    </View>
  );
}

const useStyles = makeStyles((t) => ({
  separated: { borderTopWidth: hairline.width, borderTopColor: t.hairline },
}));
