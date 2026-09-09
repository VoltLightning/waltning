/**
 * `<PagerFrame>` — S04's whole shell: the period, the four names, and the
 * pages beneath them (S04 §3).
 *
 * **This exists so the chrome is assembled once.** `PagerHeader` and `PageTabs`
 * are shared by all four pages and never scroll away; a screen that composed
 * them itself would be free to draw them per page, and the first time one page
 * drew a slightly different bar the pager would stop reading as one screen.
 *
 * **It owns nothing.** The date and the page both arrive as props
 * — `usePagerDate` holds them and `today-screen` wires them — because the
 * rules that could be wrong belong somewhere a test reaches without
 * rendering, and this component is the part that only draws.
 *
 * **Tapping a name and swiping to a page are the same event.** Both call
 * `onPageChange`; neither is the primary, and neither knows about the other.
 */

import { memo } from "react";
import { View } from "react-native";
import Animated, {
  type SharedValue,
  useAnimatedStyle,
  useSharedValue,
} from "react-native-reanimated";
import { useSafeArea } from "../../../primitives/safe-area";
import { makeStyles } from "../../../theme/styles.ts";
import { space } from "../../../tokens.ts";
import { type PageTab, PageTabs } from "../../molecules/page-tabs/page-tabs";
import { chromeSlack, collapseProgress } from "../../molecules/pager-header/collapse.ts";
import { PagerHeader } from "../../molecules/pager-header/pager-header";
import { Pager, type PagerPage } from "../pager/pager";
import { usePeriodMotion } from "./use-period-motion.ts";

export type PagerFrameProps = {
  /** Already formatted and localised — `September`, `2026`, `March 2024`. */
  periodLabel: string;
  /** The line under the title at rest — the year. `null` where the label says it all. */
  periodDetail: string | null;
  /** Opens the picker. The title at rest is the affordance. */
  onPickPeriod: () => void;
  /**
   * How far the visible page has scrolled. The header collapses from it, so
   * every page forwards what its own scroller already reports and nothing has
   * to lift a second copy of the offset.
   */
  scrollY: SharedValue<number>;
  /** Absent where the ledger cannot go further. */
  onPrevious?: (() => void) | undefined;
  onNext?: (() => void) | undefined;
  onSearch: () => void;
  /** Accessible names for the header's controls, localised by the caller. */
  barLabels: { previous: string; next: string; search: string; pickPeriod: string };

  /** The four pages, in the order they are swiped through. */
  pages: readonly PagerPage[];
  activeKey: string;
  onPageChange: (key: string) => void;
  /**
   * The period on screen, as a sortable string — `2026-09`.
   *
   * Stepping or picking one replaces every figure on all four pages at once,
   * and swapped instantly that reads as a redraw rather than as a move: nothing
   * says which way you went. The pages come in from the side you stepped from,
   * which is the one thing the figures cannot say themselves. Sortable because
   * that comparison is what knows the side.
   */
  periodKey: string;
};

function PagerFrameView({
  periodLabel,
  periodDetail,
  onPickPeriod,
  scrollY,
  onPrevious,
  onNext,
  onSearch,
  barLabels,
  pages,
  activeKey,
  onPageChange,
  periodKey,
}: PagerFrameProps) {
  const styles = useStyles();
  const insets = useSafeArea();
  // One value, written by the pager as it scrolls and read by the tabs as they
  // draw. It lives here because this is what both of them have in common —
  // neither owns the other, and a callback between them would put a JS
  // round-trip in the middle of a gesture.
  const progress = useSharedValue(0);
  const period = usePeriodMotion(periodKey, activeKey);
  /**
   * What the chrome has not yet given back, taken off its own footprint and
   * handed to the pager as a transform — `chromeSlack` has the whole argument.
   * The pair is what keeps the pager's layout box identical at every offset,
   * so the header can no longer resize the scroller it is reading.
   */
  const give = useAnimatedStyle(
    () => ({ marginBottom: -chromeSlack(collapseProgress(scrollY.value)) }),
    [scrollY],
  );
  const take = useAnimatedStyle(
    () => ({ transform: [{ translateY: chromeSlack(collapseProgress(scrollY.value)) }] }),
    [scrollY],
  );
  // Not in `useStyles`: that cache is keyed on the theme and this is keyed on
  // the device. The chrome is the top of the screen, so it clears the status
  // bar — without this the month sits under the clock.
  const clearStatusBar = { paddingTop: insets.top + space.xs };
  // `PageTabs` wants the labels only; the pages carry the same strings for
  // their panels, so one list is the source and neither can drift from it.
  const tabs: readonly PageTab[] = pages.map((page) => ({ key: page.key, label: page.label }));

  return (
    <View style={styles.root}>
      <Animated.View style={[styles.chrome, clearStatusBar, give]}>
        <PagerHeader
          label={periodLabel}
          detail={periodDetail}
          onPickPeriod={onPickPeriod}
          scrollY={scrollY}
          onPrevious={onPrevious}
          onNext={onNext}
          onSearch={onSearch}
          labels={barLabels}
        />
        <PageTabs tabs={tabs} activeKey={activeKey} onSelect={onPageChange} progress={progress} />
      </Animated.View>
      {/*
        Two views, because they carry two transforms and a style array does not
        merge them — the later `transform` replaces the earlier one outright,
        so a page step would cancel the follow or the follow would cancel the
        page step. The outer one follows the chrome; the inner one is the
        period's own motion, which knows nothing about the scroll.
      */}
      <Animated.View style={[styles.pages, take]}>
        <Animated.View style={[styles.period, period]}>
          <Pager
            pages={pages}
            activeKey={activeKey}
            onActiveKeyChange={onPageChange}
            progress={progress}
          />
        </Animated.View>
      </Animated.View>
    </View>
  );
}

export const PagerFrame = memo(PagerFrameView);

const useStyles = makeStyles((theme) => ({
  /**
   * **Out of flow, filling its parent — not `flex: 1`.**
   *
   * The route wrapper this screen mounts inside grows but does not shrink
   * (`flexGrow: 1; flexShrink: 0`), so under `flex: 1` its height is whatever
   * this subtree's content adds up to. The pager is then as tall as its
   * tallest page, the screen is taller than the device, and nothing clips or
   * scrolls it: everything past the fold is unreachable, which is what
   * Summary's *Go to* grid was.
   *
   * Absolute positioning breaks the cycle at its source rather than patching
   * it downstream — an out-of-flow child contributes no intrinsic height, so
   * the wrapper takes the device's, and every height below here resolves
   * downward from a real number. Measuring the pager instead cannot work: the
   * measurement is derived from the very heights it would be setting.
   */
  pages: { flex: 1 },
  period: { flex: 1 },
  root: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: theme.ground,
    /**
     * **The pager hangs one collapse below the screen at rest, and this is
     * what stops that showing.** Its box is the collapsed size at every
     * offset — that is the whole point of `chromeSlack` — so while the header
     * is open the same box is pushed down past the bottom edge by exactly the
     * height the header has not yet given up. The reader loses nothing: the
     * part below the edge is the part they are about to scroll to, and
     * scrolling to it is what brings it up.
     */
    overflow: "hidden",
  },
  // The chrome sits on the surface, not the ground: it is the thing the pages
  // move under, and a band the same colour as what scrolls past it stops
  // reading as fixed.
  chrome: {
    backgroundColor: theme.surface,
    paddingHorizontal: space.x3,
    gap: space.sm,
  },
}));
