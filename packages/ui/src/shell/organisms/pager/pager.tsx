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

import { memo, useCallback, useEffect, useRef } from "react";
import {
  type NativeSyntheticEvent,
  type ScrollView,
  useWindowDimensions,
  View,
} from "react-native";
import Reanimated, { type SharedValue, useAnimatedScrollHandler } from "react-native-reanimated";
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
  /**
   * Where the swipe is, in pages — `1.5` is halfway between the second and the
   * third. Written every frame on the UI thread so the chrome above can follow
   * the finger; a boolean "which page" could only ever snap.
   */
  progress: SharedValue<number>;
};

function PagerView({ pages, activeKey, onActiveKeyChange, progress }: PagerProps) {
  const styles = useStyles();
  const scroller = useRef<ScrollView>(null);
  /**
   * **The window's width, not a measured one.**
   *
   * `onLayout` fires on neither the scroller nor a plain `View` around it in
   * `react-native-web`, and the failure is silent: the width stayed 0, so
   * `scrollTo` was asked for `index * 0`, and the pager moved its tab marker
   * while the pages never went anywhere. A measurement that can quietly be
   * zero is the wrong source for the one number this component needs.
   *
   * The window is the right source because `PagerFrame` is positioned to the
   * screen's edges — the pager *is* the width of the device, by construction
   * rather than by measurement, and it follows a rotation for free.
   *
   * The height needs no equivalent: `100%` in the stylesheet resolves against
   * the track, and measuring it could not work anyway — a slot's height is
   * what the measurement would be derived from.
   */
  const width = useWindowDimensions().width;
  // Resolved once, and everything downstream reads the resolution rather than
  // the prop. A caller holding a stale key otherwise scrolls to page 0 while
  // no page is marked current — the offset and the mark disagreeing, which is
  // a blank-looking frame nobody can explain.
  const found = pages.findIndex((page) => page.key === activeKey);
  const index = found === -1 ? 0 : found;
  const currentKey = pages[index]?.key;

  // A tab tap changes `activeKey` and the offset follows. Not the other way
  // round: the scroll is a view of the state, so a page that arrived by swipe
  // is already where it needs to be and this is a no-op for it.
  //
  // **`animated: false`, and it is not a preference.** `pagingEnabled` is CSS
  // scroll-snap on the web, and a smooth programmatic scroll fights it: the
  // glide starts, the snap pulls it back to the page it left, and it settles
  // six pixels from where it began. An instant scroll lands exactly on a snap
  // point, so there is nothing to argue with. The swipe keeps its own momentum
  // either way — that is the browser's, not this.
  useEffect(() => {
    if (width === 0) return;
    scroller.current?.scrollTo({ x: index * width, y: 0, animated: false });
  }, [index, width]);

  // The offset in page units, on the UI thread. `width` is captured by the
  // worklet rather than read from a ref: it changes only on rotation, and the
  // handler is rebuilt when it does.
  const onScroll = useAnimatedScrollHandler(
    {
      onScroll: (event) => {
        if (width === 0) return;
        progress.value = event.contentOffset.x / width;
      },
    },
    [width, progress],
  );

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
    <View style={styles.frame}>
      <Reanimated.ScrollView
        ref={scroller}
        horizontal
        pagingEnabled
        showsHorizontalScrollIndicator={false}
        onScroll={onScroll}
        // 16ms: the marker above follows this, and the default reports once per
        // gesture — a marker that jumps when the finger lifts.
        scrollEventThrottle={16}
        onMomentumScrollEnd={onMomentumScrollEnd}
        // The slots have to be as tall as the track, not as tall as what is in
        // them. `flexGrow` on the scroller's own `style` does not reach them —
        // it sizes the viewport — so a page whose content ran past the fold got
        // an unbounded height, and the vertical scroller inside it had nothing
        // to scroll within: Summary's *Go to* grid was simply cut off, with no
        // gesture that could reach it.
        contentContainerStyle={styles.track}
        {...pageScrollProps(styles.viewport)}
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
      </Reanimated.ScrollView>
    </View>
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
  frame: { flex: 1, minWidth: 0 },
  /**
   * **`minWidth: 0` is what makes this scroll rather than stretch.** A flex
   * item's `min-width` resolves to `auto`, which is its content's minimum — and
   * this scroller's content is four pages side by side. Without the override
   * the viewport widened to 1600pt inside a 400pt phone, the pages sat in a row
   * off the edge of the screen, and `scrollTo` had nothing to scroll: the tab
   * marker moved and the content never did.
   */
  viewport: { flex: 1, minWidth: 0 },
  // `flexGrow` so the track is as tall as the scroller even when its slots
  // are not, which is what gives the percentage below something definite to
  // resolve against.
  track: { flexGrow: 1 },
  /**
   * **`height: "100%"`, and never `flexGrow`.**
   *
   * A slot that sizes to its content makes the pager as tall as its tallest
   * page, and that height travels up through the route wrapper — which grows
   * but does not shrink — until the screen is taller than the device. Nothing
   * clips it and nothing scrolls, so the page below the fold is unreachable:
   * Summary's *Go to* grid was exactly that. The percentage resolves against
   * the track, which is bounded by the scroller, which is bounded by the
   * device — so the slot is the viewport and never the content.
   *
   * `overflow: hidden` is the other half: a page taller than the slot then
   * scrolls inside its own scroller rather than pushing the pager taller.
   *
   * `flexShrink: 0` because CSS shrinks flex children by default and React
   * Native does not. Without it every page after the first is squeezed to
   * share one screen's width — the second slot measured 32pt of the 503 it
   * had been given — so a swipe landed on a page drawn in a column.
   */
  slot: { height: "100%", flexShrink: 0, overflow: "hidden" },
}));
