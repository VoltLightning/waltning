/**
 * `<PageTabs>` — the four names above S04's pager, S04 §3.
 *
 * **This exists because a swipe has no affordance.** The pages are reached by
 * swiping; a gesture nothing draws is a gesture only its author knows about,
 * so the names are on screen and tapping one does exactly what swiping to it
 * does. Neither is the primary.
 *
 * **A marker on a hairline, not a filled band.** Three treatments were drawn:
 * a recessed track with the active page as a raised chip, icons with only the
 * active page named, and this. The track spends a filled band on four words;
 * the icons ask three glyphs to carry meaning alone, which works for a grid
 * and a list and guesses at a summary. This is the quiet one, and the one
 * that survives a fifth page.
 *
 * **The marker is short and the rule is full width.** An underline as wide as
 * its label makes the longest word look selected before you read it — the bar
 * reads as ragged rather than as a control.
 *
 * **The marker follows the finger, and so does the ink.** It reads the pager's
 * scroll in page units rather than which tab is active, so a half-finished
 * swipe leaves the marker half-way and the two labels half-toned. A marker
 * driven by `activeKey` can only ever jump when the gesture ends, which makes
 * the bar look like it is reacting to the swipe rather than being part of it.
 *
 * **Positions are percentages, not measured pixels.** The items are `flex: 1`,
 * so each is exactly `100 / count`% of the row whatever the device — and
 * `onLayout` is not reliable in this tree (`pager.tsx` says where that was
 * learned). A percentage cannot silently be zero.
 */

import { memo, useCallback, useMemo } from "react";
import { Pressable, View } from "react-native";
import Animated, {
  interpolateColor,
  type SharedValue,
  useAnimatedStyle,
} from "react-native-reanimated";
import { useInteraction } from "../../../primitives/interaction.ts";
import { text } from "../../../theme/fonts.ts";
import { useTheme } from "../../../theme/provider";
import { makeStyles } from "../../../theme/styles.ts";
import { focus, radius, space, touchTarget } from "../../../tokens.ts";
import { markerShift, slotWidth, tintRange } from "./track.ts";

export type PageTab = {
  /** Stable across renders — the page's identity, not its position. */
  key: string;
  /** Already localised by the caller: this component holds no copy. */
  label: string;
};

export type PageTabsProps = {
  tabs: readonly PageTab[];
  activeKey: string;
  onSelect: (key: string) => void;
  /** Where the swipe is, in pages. `1.5` is halfway between the second and third. */
  progress: SharedValue<number>;
};

function TabItem({
  tab,
  index,
  active,
  onSelect,
  progress,
}: {
  tab: PageTab;
  index: number;
  active: boolean;
  onSelect: (key: string) => void;
  progress: SharedValue<number>;
}) {
  const styles = useStyles();
  const theme = useTheme();
  const { focused, handlers } = useInteraction();
  const key = tab.key;
  const press = useCallback(() => onSelect(key), [onSelect, key]);

  // Ink and weight both cross with the gesture. The weight is a step rather
  // than a ramp — `fontWeight` has no meaningful half — so it turns at the
  // midpoint, where the reader has already committed to the next page.
  const ink = useAnimatedStyle(
    () => ({
      color: interpolateColor(progress.value, tintRange(index), [
        theme.textMuted,
        theme.text,
        theme.textMuted,
      ]),
    }),
    [progress, index, theme.text, theme.textMuted],
  );

  // `react-native-web` never reads RN-core's `accessibilityState` object:
  // `createDOMProps` recognises only this flat legacy name, so `aria-selected`
  // never reaches the DOM without it and a web reader is told nothing about
  // what is current. `conformance.test.ts` now refuses one without the other.
  const ariaSelectedProps: { accessibilitySelected: boolean } = {
    accessibilitySelected: active,
  };

  return (
    <Pressable
      accessibilityRole="tab"
      accessibilityState={{ selected: active }}
      {...ariaSelectedProps}
      // `react-native-web` never reads the state object — `createDOMProps`
      // recognises only this flat legacy name, so `aria-selected` never
      // reaches the DOM without it (`conformance.test.ts` now refuses one
      // without the other).
      onPress={press}
      {...handlers}
      style={[styles.item, focused ? styles.focused : null]}
    >
      <Animated.Text style={[active ? styles.labelActive : styles.label, ink]}>
        {tab.label}
      </Animated.Text>
    </Pressable>
  );
}

const MemoTabItem = memo(TabItem);

function PageTabsView({ tabs, activeKey, onSelect, progress }: PageTabsProps) {
  const styles = useStyles();
  const count = tabs.length;
  const slot = useMemo(() => ({ width: slotWidth(count) }) as const, [count]);
  // One marker for the row, not one per tab: a bar that slides between two
  // positions is a different object from four bars taking turns being visible.
  //
  // **`translateX`, never `left`.** `left` is a layout property: setting it on
  // every scroll event made the browser re-lay-out the row each frame, and a
  // tab change cost a 63ms task on the main thread — measured, and the same
  // 63ms whichever page it went to, which is what gave it away as chrome
  // rather than content. A transform is composited and costs nothing.
  //
  // The percentage is of the slot's own width, and the slot is exactly one tab
  // wide — so one page of progress is one slot of travel, with nothing
  // measured.
  const slide = useAnimatedStyle(
    () => ({ transform: [{ translateX: markerShift(progress.value) }] }),
    [progress],
  );

  return (
    <View accessibilityRole="tablist" style={styles.row}>
      {tabs.map((tab, index) => (
        <MemoTabItem
          key={tab.key}
          tab={tab}
          index={index}
          active={tab.key === activeKey}
          onSelect={onSelect}
          progress={progress}
        />
      ))}
      {/*
        Decorative: which tab is current is already in every tab's own
        `aria-selected`, so a reader hears it from the control rather than from
        a bar drawn under one.
      */}
      <Animated.View
        style={[styles.markerSlot, slot, slide]}
        pointerEvents="none"
        accessibilityElementsHidden
        importantForAccessibility="no-hide-descendants"
        {...HIDDEN}
      >
        <View style={styles.marker} />
      </Animated.View>
    </View>
  );
}

/** `react-native-web` maps neither native hiding prop (`conformance.test.ts`). */
const HIDDEN: { "aria-hidden": true } = { "aria-hidden": true };

export const PageTabs = memo(PageTabsView);

const useStyles = makeStyles((theme) => ({
  row: {
    flexDirection: "row",
    gap: space.xxs,
    borderBottomWidth: 1,
    borderBottomColor: theme.border,
  },
  item: {
    flex: 1,
    minHeight: touchTarget.min,
    alignItems: "center",
    justifyContent: "center",
    paddingBottom: space.md,
  },
  focused: {
    outlineWidth: focus.width,
    outlineColor: theme.focusRing,
    outlineOffset: focus.offset,
  },
  /**
   * The boards draw these at 12.5/500 and 12.5/600. `bodySm` at 400 made four
   * words the loudest row of the chrome.
   */
  label: { ...text.ui("caption", 500), color: theme.textMuted },
  labelActive: { ...text.ui("caption", 600), color: theme.text },
  // One slot the width of a tab, slid across the row. `bottom: 0` and not
  // `-1`: a marker hung below the row is drawn under the panel that starts
  // there, so it came out sliced along its length.
  markerSlot: {
    position: "absolute",
    bottom: 0,
    left: 0,
    alignItems: "center",
  },
  marker: {
    width: 18,
    height: 2,
    borderRadius: radius.pill,
    backgroundColor: theme.accent,
  },
}));
