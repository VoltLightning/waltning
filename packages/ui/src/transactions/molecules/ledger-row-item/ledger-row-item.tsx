/**
 * `<LedgerRowItem>` — one row of a ledger list: the entry, answering a tap.
 *
 * **Rows do not swipe** (S10 §7). A sideways drag used to categorise or open
 * the row depending on how far it went, and nothing on screen said either;
 * it was removed rather than labelled. Categorising is in the transaction
 * (S09), and on the desk ledger across a selection.
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
  withAccount?: boolean;
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
