/**
 * `<LedgerRowItem>` — one row of a ledger list: the entry, and the swipe when
 * the row has something to swipe for.
 *
 * **The rule it carries is which rows can be categorised.** A transfer moves
 * money between your own accounts and an adjustment corrects a balance;
 * neither has a category, by constraint (`transactions_category_shape`), so
 * neither takes a swipe. A gesture that opens a sheet with nothing to choose
 * is worse than no gesture: it teaches that the swipe sometimes does nothing.
 *
 * Lived inside `ledger-screen.tsx` while S10 was the only list. S04's List
 * page draws the same rows under the same rule, and a rule about which rows
 * can be categorised is not a property of the screen that happened to need it
 * first — a second copy would be the place the two lists start disagreeing.
 *
 * **It composes, it does not fetch.** `withAccount` is on because both lists
 * span accounts; a list scoped to one would pass it off, and that is the
 * caller's to know.
 */

import { memo, useCallback } from "react";
import { EntryRow, type LedgerEntry } from "../entry-row/entry-row";
import { SwipeableRow } from "../swipeable-row/swipeable-row";

export type LedgerRowItemProps = {
  row: LedgerEntry;
  onPress: (id: string) => void;
  /** Categorise. Absent where the list offers no swipe at all. */
  onShortSwipe?: ((id: string) => void) | undefined;
  /** Open the row's detail. */
  onLongSwipe?: ((id: string) => void) | undefined;
  /** Draw the account beside the category — off for a list already scoped to one. */
  withAccount?: boolean;
};

function LedgerRowItemView({
  row,
  onPress,
  onShortSwipe,
  onLongSwipe,
  withAccount = true,
}: LedgerRowItemProps) {
  const shortSwipe = useCallback(() => onShortSwipe?.(row.id), [onShortSwipe, row.id]);
  const longSwipe = useCallback(() => onLongSwipe?.(row.id), [onLongSwipe, row.id]);
  const entry = <EntryRow row={row} onPress={onPress} withAccount={withAccount} />;

  // Both handlers, or the row is tap-only: a half-wired `SwipeableRow` would
  // answer one gesture and swallow the other.
  const swipeable =
    (row.type === "income" || row.type === "expense") &&
    onShortSwipe !== undefined &&
    onLongSwipe !== undefined;

  if (!swipeable) return entry;

  return (
    <SwipeableRow onShortSwipe={shortSwipe} onLongSwipe={longSwipe}>
      {entry}
    </SwipeableRow>
  );
}

export const LedgerRowItem = memo(LedgerRowItemView);
