/**
 * `<LedgerScroller>` — S04's List page, the scrolling part and nothing else.
 *
 * **Its own component so that the page around it can re-render without it.**
 * The page holds the shared date, and the date moves every time a scroll
 * settles — which is a fact about the *strip* and the *pill*, not about the
 * rows. Inline in the page, every settle re-rendered the `FlatList`, and React
 * Native's cell renderers are not pure: the render probe counted every mounted
 * cell re-rendering about five times per stop, ~2,000 component renders to
 * move one highlight. Behind `memo`, with props that are stable across a
 * settle, the list does not hear about it.
 *
 * **Every prop is a stable reference or the list's own data.** That is the
 * contract that makes the memo real, and `tools/e2e/specs/renders.spec.ts`
 * pins it from the outside: a settle may not re-render a single cell.
 */

import type { CurrencyCode } from "@waltning/core/money";
import { memo, type ReactElement, type RefObject, useCallback } from "react";
import type { FlatList, StyleProp, ViewStyle, ViewToken } from "react-native";
import Animated from "react-native-reanimated";
import { pageScrollProps } from "../../../primitives/nested-scroll.ts";
import type { ScrollHandler } from "../../../shell/molecules/card/card";
import { makeStyles } from "../../../theme/styles.ts";
import type { EntryHeightKey, ListEntry } from "../../molecules/list-entry/entry.ts";
import { ListEntryCell, type ListEntryHandlers } from "../../molecules/list-entry/list-entry";

/**
 * Six tenths of a screen, not the default tenth: the read is synchronous
 * SQLite, so a page arrives within a frame and asking early costs nothing —
 * where asking late leaves the reader at the end of the list with the next
 * page still being read.
 */
const END_REACHED_THRESHOLD = 0.6;

/**
 * Keep the row the reader is on where it is when a page arrives above it.
 *
 * `minIndexForVisible: 1` rather than `0`: index 0 is the topmost rendered
 * item, and anchoring to it is what makes a list refuse to scroll into new
 * content at all.
 */
const KEEP_POSITION = { minIndexForVisible: 1 } as const;

/**
 * Viewability, as this list uses it: is the very first item on screen at all?
 *
 * One pixel is the threshold because the question is binary — the reader is at
 * the top of the list or they have left it — and a percentage would make a tall
 * first row (a day header plus its first entry) answer *no* while most of it is
 * still visible. Frozen at module scope: `FlatList` refuses a config that
 * changes identity between renders.
 */
const AT_THE_TOP = { viewAreaCoveragePercentThreshold: 0 } as const;

export type LedgerScrollerProps = {
  listRef: RefObject<FlatList<ListEntry> | null>;
  entries: readonly ListEntry[];
  handlers: ListEntryHandlers;
  currency: CurrencyCode;
  decimals: number;
  onMeasure: (key: EntryHeightKey, height: number, entry: string) => void;
  /** What stands where the rows would, or `null` while the halves are still being read. */
  empty: ReactElement | null;
  contentStyle: StyleProp<ViewStyle>;
  onScroll: ScrollHandler;
  onEndReached: () => void;
  onStartReached: () => void;
  onViewableItemsChanged: (info: { viewableItems: ViewToken[] }) => void;
  onScrollToIndexFailed: (info: { index: number; averageItemLength: number }) => void;
};

function keyOf(entry: ListEntry): string {
  return entry.key;
}

function LedgerScrollerView({
  listRef,
  entries,
  handlers,
  currency,
  decimals,
  onMeasure,
  empty,
  contentStyle,
  onScroll,
  onEndReached,
  onStartReached,
  onViewableItemsChanged,
  onScrollToIndexFailed,
}: LedgerScrollerProps) {
  const styles = useStyles();
  const renderItem = useCallback(
    ({ item }: { item: ListEntry }) => (
      <ListEntryCell
        entry={item}
        handlers={handlers}
        currency={currency}
        decimals={decimals}
        onMeasure={onMeasure}
      />
    ),
    [handlers, currency, decimals, onMeasure],
  );

  return (
    <Animated.FlatList
      ref={listRef}
      onScrollToIndexFailed={onScrollToIndexFailed}
      data={entries}
      renderItem={renderItem}
      keyExtractor={keyOf}
      ListEmptyComponent={empty}
      // So the empty state has the page to sit in rather than a strip at the
      // top of one: with no rows the content is shorter than the scroller.
      contentContainerStyle={contentStyle}
      onEndReached={onEndReached}
      onEndReachedThreshold={END_REACHED_THRESHOLD}
      onStartReached={onStartReached}
      onStartReachedThreshold={END_REACHED_THRESHOLD}
      onViewableItemsChanged={onViewableItemsChanged}
      viewabilityConfig={AT_THE_TOP}
      // **Without this the list jumps.** A newer page is *prepended*, so
      // everything below it moves down by the height of what arrived and the
      // row the reader was looking at leaves the screen. This pins the first
      // visible item and lets the content grow above it instead.
      maintainVisibleContentPosition={KEEP_POSITION}
      onScroll={onScroll}
      // 16ms: the header and the strip both interpolate from this, and the
      // default reports once per gesture.
      scrollEventThrottle={16}
      // The page's own vertical scroller, inside the pager's horizontal one.
      {...pageScrollProps(styles.list)}
    />
  );
}

export const LedgerScroller = memo(LedgerScrollerView);

const useStyles = makeStyles(() => ({
  list: { flex: 1 },
}));
