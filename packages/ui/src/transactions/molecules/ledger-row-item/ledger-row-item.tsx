/**
 * `<LedgerRowItem>` — one row of a ledger list: the entry, answering a tap.
 *
 * **Rows do not swipe** (S10 §7, `design-system/05` §5.6): a gesture nothing
 * on screen names is one a reader triggers by accident. Categorising is in
 * the transaction (S09), and on the desk ledger across a selection.
 *
 * Shared by S10's ledger and S04's List page, so the two lists draw a row the
 * same way. **It composes, it does not fetch.** `withAccount` is on because
 * both lists span accounts; a list scoped to one would pass it off, and that
 * is the caller's to know. Memoised: a long list re-renders a row only when
 * its own entry changes.
 */

import { memo } from "react";
import { EntryRow } from "../entry-row/entry-row";
import type { LedgerEntry } from "../entry-row/ledger-entry.ts";

export type LedgerRowItemProps = {
  row: LedgerEntry;
  onPress: (id: string) => void;
  /** Draw the account beside the category — off for a list already scoped to one. */
  withAccount?: boolean;
  /** Draw the date — off inside a `<DayGroup>`, which has already given it. */
  withDate?: boolean;
};

function LedgerRowItemView({ row, onPress, withAccount = true, withDate }: LedgerRowItemProps) {
  return (
    <EntryRow
      row={row}
      onPress={onPress}
      withAccount={withAccount}
      {...(withDate === undefined ? {} : { withDate })}
    />
  );
}

export const LedgerRowItem = memo(LedgerRowItemView);
