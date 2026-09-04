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
 *
 * **`onPress` is one prop on the list, not one per item.** S09: every row
 * opens the same detail screen for its own id, so the list takes a single
 * `(id) => void` and threads it — a screen building `TransactionListItem[]`
 * would otherwise have to close over each id itself, and `architecture/11`
 * bans exactly that arrow-in-JSX. `CurriedRow` below is the named
 * component the id is curried through instead, the same shape
 * `quick-add-form.tsx`'s `AccountChoice` already uses for one row of a list.
 */

import { useCallback } from "react";
import { View } from "react-native";
import { makeStyles } from "../theme/styles.ts";
import { hairline } from "../tokens.ts";
import { TransactionRow, type TransactionRowProps } from "./transaction-row";

/** The row's props plus the ledger's own id, which is the key. */
export type TransactionListItem = TransactionRowProps & { id: string };

export type TransactionListProps = {
  transactions: readonly TransactionListItem[];
  /** Present only where a tap opens something — S09's detail screen. */
  onPress?: (id: string) => void;
};

export function TransactionList({ transactions, onPress }: TransactionListProps) {
  const styles = useStyles();

  return (
    <View>
      {transactions.map((row, index) => (
        <View key={row.id} style={index === 0 ? null : styles.separated}>
          <CurriedRow row={row} {...(onPress ? { onPress } : {})} />
        </View>
      ))}
    </View>
  );
}

type CurriedRowProps = {
  row: TransactionListItem;
  onPress?: (id: string) => void;
};

/** Curries the list-level `onPress` down to this one row's id. */
function CurriedRow({ row, onPress }: CurriedRowProps) {
  const { id, ...rowProps } = row;
  const handlePress = useCallback(() => onPress?.(id), [id, onPress]);
  return <TransactionRow {...rowProps} {...(onPress ? { onPress: handlePress } : {})} />;
}

const useStyles = makeStyles((theme) => ({
  separated: { borderTopWidth: hairline.width, borderTopColor: theme.hairline },
}));
