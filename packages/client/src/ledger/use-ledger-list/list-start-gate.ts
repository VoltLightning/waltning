/**
 * When a bidirectional list may page *forward* — S04 §6's "scrolling from
 * there walks outward day by day".
 *
 * **A list reports *start reached* on the frame it mounts.** The scroll offset
 * is zero and zero is inside the threshold, so `FlatList` asks for a newer page
 * before anybody has touched it. That call is indistinguishable from a reader
 * pulling down, and it is what put the rest of the ledger back above a jumped
 * anchor the moment `useLedgerList` stopped pre-filling it: the list loaded
 * nothing newer and then asked for it 16ms later.
 *
 * **Viewability is the signal, not the offset.** `onScroll` on S04's list
 * belongs to the header's collapse worklet — one handler, and two animated
 * scroll handlers do not compose — and `onScrollBeginDrag` never fires for a
 * wheel on `react-native-web`. Three surfaces ship, so a signal two of them
 * honour is not a signal. *Item 0 has left the viewport* is the same fact on
 * all three.
 *
 * **Pure, and no React**, for the same reason `pager-date.ts` is: the rule that
 * can be wrong is testable without rendering, and neither viewability nor an
 * edge callback fires under jsdom — a gate written inside the component would
 * be dead code in every test that draws it.
 *
 * **What this cannot rescue: a list shorter than its own viewport.**
 * `VirtualizedList` checks its two edges in one `else if` — the end branch
 * first — so a list that has not filled a screen reports *end reached* and
 * never *start reached*, gate or no gate. From a sparse jump the forward walk
 * therefore does not exist, and the stepper and `TodayPill` are the way out;
 * S04 §6 says so rather than promising a walk that has nothing to walk on.
 */

/** As much of `ViewToken` as this decides anything from. */
export type ViewablePosition = { index: number | null };

export type ListStartGate = {
  /** Feed it `onViewableItemsChanged`'s `viewableItems`. */
  note(viewableItems: readonly ViewablePosition[]): void;
  /** Whether the reader has left the top since the last `reset`. */
  opened(): boolean;
  /**
   * A new list — a new anchor, or a new filter — is a new answer. Not doing
   * this would carry one jump's scrolling into the next one, where the reader
   * has not moved at all.
   */
  reset(): void;
};

export function listStartGate(): ListStartGate {
  let open = false;
  return {
    note(viewableItems) {
      // Present means the reader is still at the top. Absent means they are
      // not — which includes an empty report, because a list with nothing
      // visible has been scrolled past everything it holds.
      if (viewableItems.some((token) => token.index === 0)) return;
      open = true;
    },
    opened() {
      return open;
    },
    reset() {
      open = false;
    },
  };
}
