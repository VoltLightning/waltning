/**
 * `<Pager>` — S04's four views of one date, swiped between (S04 §3).
 *
 * **Every page stays mounted.** Four pages over one ledger is cheap, and what
 * it buys is the thing a pager is for: swiping to Months and back does not
 * cost the List its scroll position, its loaded pages or its anchor. A pager
 * that unmounted would make every crossing a reload, which is exactly the
 * navigation the swipe replaced.
 *
 * **Mounted is not the same as re-rendered.** The page bodies are `children`,
 * so React reconciles them by identity: changing which page is current moves
 * a scroll offset and re-renders this component, and touches none of them.
 * `pager.test.tsx` counts that rather than asserting it — the property dies
 * silently the moment a caller builds its pages inline in a render.
 *
 * **Controlled, because the date is.** The active page is a prop and every
 * change is reported up, so a tap on `PageTabs` and a swipe here are the same
 * state change arriving from two directions. A pager holding its own index
 * would have to be told about the tab bar, and they would drift.
 */

import { memo, useCallback, useEffect, useRef, useState } from "react";
import { type LayoutChangeEvent, type NativeSyntheticEvent, ScrollView, View } from "react-native";
import { pageScrollProps } from "../../../primitives/nested-scroll.ts";
import { makeStyles } from "../../../theme/styles.ts";

type ScrollEvent = NativeSyntheticEvent<{
  contentOffset: { x: number; y: number };
  layoutMeasurement: { width: number; height: number };
}>;

export type PagerPage = {
  /** The page's identity, stable across renders — never its position. */
  key: string;
  node: React.ReactNode;
  /** Announced when the page becomes current, localised by the caller. */
  label: string;
};

export type PagerProps = {
  pages: readonly PagerPage[];
  activeKey: string;
  onActiveKeyChange: (key: string) => void;
};

function PagerView({ pages, activeKey, onActiveKeyChange }: PagerProps) {
  const styles = useStyles();
  const scroller = useRef<ScrollView>(null);
  const [width, setWidth] = useState(0);
  // Resolved once, and everything downstream reads the resolution rather than
  // the prop. A caller holding a stale key otherwise scrolls to page 0 while
  // no page is marked current — the offset and the mark disagreeing, which is
  // a blank-looking frame nobody can explain.
  const found = pages.findIndex((page) => page.key === activeKey);
  const index = found === -1 ? 0 : found;
  const currentKey = pages[index]?.key;

  const onLayout = useCallback((event: LayoutChangeEvent) => {
    setWidth(event.nativeEvent.layout.width);
  }, []);

  // A tab tap changes `activeKey` and the offset follows. Not the other way
  // round: the scroll is a view of the state, so a page that arrived by swipe
  // is already where it needs to be and this is a no-op for it.
  useEffect(() => {
    if (width === 0) return;
    scroller.current?.scrollTo({ x: index * width, y: 0, animated: true });
  }, [index, width]);

  const onMomentumScrollEnd = useCallback(
    (event: ScrollEvent) => {
      if (width === 0) return;
      const landed = Math.round(event.nativeEvent.contentOffset.x / width);
      const page = pages[landed];
      // Reported only when it actually changed: a swipe that bounced back
      // would otherwise re-announce the page the reader never left.
      if (page !== undefined && page.key !== currentKey) onActiveKeyChange(page.key);
    },
    [currentKey, onActiveKeyChange, pages, width],
  );

  return (
    <ScrollView
      horizontal
      pagingEnabled
      showsHorizontalScrollIndicator={false}
      onLayout={onLayout}
      onMomentumScrollEnd={onMomentumScrollEnd}
      {...pageScrollProps(styles.track)}
    >
      {pages.map((page) => (
        <PagerSlot
          key={page.key}
          width={width}
          label={page.label}
          current={page.key === currentKey}
        >
          {page.node}
        </PagerSlot>
      ))}
    </ScrollView>
  );
}

/**
 * One page's box. Memoised on `width` and `current` alone, so the body inside
 * it is reconciled by identity and never re-rendered by a crossing.
 *
 * `accessibilityElementsHidden` on the pages you are not on: a screen reader
 * walking four mounted pages would read the whole ledger, the calendar and the
 * year as one document, which is what mounting them all costs if nothing says
 * otherwise.
 */
function PagerSlotView({
  width,
  label,
  current,
  children,
}: {
  width: number;
  label: string;
  current: boolean;
  children: React.ReactNode;
}) {
  const styles = useStyles();
  // `accessibilityElementsHidden` and `importantForAccessibility` are native
  // only — `react-native-web` maps neither, so on the web build all four
  // pages stay in the accessibility tree and read as one document. The same
  // gap `TabBar` documents for `accessibilityState`; `aria-hidden` is the
  // form that crosses, and RN maps it back to the native pair.
  // `tabpanel` has no native role — VoiceOver has no such thing — so it goes
  // out as the ARIA `role`, which is web-only by construction and correct
  // for that reason.
  const webProps: { "aria-hidden": boolean; role: "tabpanel" } = {
    "aria-hidden": !current,
    role: "tabpanel",
  };

  return (
    <View
      accessibilityLabel={label}
      accessibilityElementsHidden={!current}
      importantForAccessibility={current ? "yes" : "no-hide-descendants"}
      {...webProps}
      style={[styles.slot, width > 0 ? { width } : null]}
    >
      {children}
    </View>
  );
}

const PagerSlot = memo(PagerSlotView);

export const Pager = memo(PagerView);

const useStyles = makeStyles(() => ({
  track: { flexGrow: 1 },
  slot: { flexGrow: 1 },
}));
