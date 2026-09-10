/**
 * `<TodayPill>` — S04 §4, and the only way back from a jump (§6).
 *
 * **A jump is one-way without it.** §6: *"Picking a far date loads that date's
 * neighbourhood and **nothing between**. Scrolling from there walks outward day
 * by day; `TodayPill` is the only way back."* Tapping a quiet run's *Show*, or a
 * ribbon cell, or a day on Calendar, moves the anchor — and the list then holds
 * that day's neighbourhood and nothing else. Walking home from 2021 is not a
 * scroll, it is four years of them.
 *
 * **It floats rather than sitting in the layout**, because the list under it is
 * infinite in both directions: a control in the flow would be a control the
 * reader scrolls away from, which is the one thing this must never be.
 *
 * **Not `shadow.float`.** §2.5 reserves that for the add button, and
 * `<Toast>` extended it once to the second thing that sits above the *screen*.
 * This sits above the *list* — inside the page, under its own chrome — so it
 * reads as raised by its edge and its fill, the way every other surface in this
 * system does. A third float would leave the token meaning "important" rather
 * than "above the page".
 *
 * **Top-centre, not bottom.** The add button owns the bottom corners and is
 * draggable to either side edge at any height (§2.9); the tab bar owns the rest
 * of the bottom. The top of the list is the one region no floating thing claims.
 */

import { useEffect } from "react";
import { Pressable, Text, View } from "react-native";
import Animated, { useAnimatedStyle, useSharedValue, withTiming } from "react-native-reanimated";
import { easing } from "../../../primitives/easing.ts";
import { useInteraction } from "../../../primitives/interaction.ts";
import { useReducedMotion } from "../../../primitives/reduced-motion.ts";
import { text } from "../../../theme/fonts.ts";
import { useTheme } from "../../../theme/provider";
import { makeStyles } from "../../../theme/styles.ts";
import { focus, motion, radius, space, touchTarget } from "../../../tokens.ts";
import { CalendarBlankIcon } from "../../phosphor";

/** The slide distance. `<Toast>`'s own: an object settling into place, not travelling. */
const ENTER_OFFSET = 8;
const ICON = 16;

export type TodayPillProps = {
  /** *Today*, localised. */
  label: string;
  /** What the pill announces — where the list is, and that this returns it. */
  accessibilityLabel: string;
  onPress: () => void;
};

export function TodayPill({ label, accessibilityLabel, onPress }: TodayPillProps) {
  const styles = useStyles();
  const theme = useTheme();
  const { focused, handlers } = useInteraction();
  const reduced = useReducedMotion();

  /**
   * **The offset animates; the opacity does not, and that is deliberate.**
   *
   * The first version faded in from 0, which made the pill *invisible* until
   * an effect ran — and the visual suite caught it at once, screenshotting
   * `opacity: 1.16e-07` and recording an empty page as this component's
   * baseline. Anything that suspends `requestAnimationFrame` does the same in
   * the app: a backgrounded tab, a paused frame loop, a platform that never
   * resolves the reduced-motion query. A control whose whole job is being the
   * only way back cannot have a resting state of *not drawn*.
   *
   * So it is on screen from the first paint and the animation only moves it
   * the last 8px. If nothing runs, the pill is simply there — the honest
   * failure for this component, where a fade's failure is a control the reader
   * cannot find.
   */
  const ty = useSharedValue(reduced ? 0 : -ENTER_OFFSET);
  useEffect(() => {
    if (reduced) {
      ty.value = 0;
      return;
    }
    ty.value = withTiming(0, { duration: motion.move.duration, easing: easing.move });
  }, [reduced, ty]);

  // Down, not up: it arrives from the chrome above the list, which is where a
  // reader's eye already is after a tap that moved the date.
  const entrance = useAnimatedStyle(() => ({ transform: [{ translateY: ty.value }] }));

  return (
    // The row is the positioned layer and the pill is centred in it, so the
    // pill is as wide as its own words. A `left: 0; right: 0` pill would be a
    // full-width bar, which is a banner and says something else.
    <View style={styles.layer}>
      <Animated.View style={entrance}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={accessibilityLabel}
          onPress={onPress}
          {...handlers}
          style={[styles.pill, focused ? styles.focused : null]}
        >
          {/* Decorative: the label beside it is the whole message. */}
          <View
            {...HIDDEN}
            accessibilityElementsHidden
            importantForAccessibility="no-hide-descendants"
          >
            <CalendarBlankIcon size={ICON} color={theme.accentText} />
          </View>
          <Text style={styles.label}>{label}</Text>
        </Pressable>
      </Animated.View>
    </View>
  );
}

/**
 * `react-native-web` maps neither native hiding prop, so the glyph stays in the
 * web build's accessibility tree without this (`conformance.test.ts`).
 */
const HIDDEN: { "aria-hidden": true } = { "aria-hidden": true };

const useStyles = makeStyles((theme) => ({
  layer: {
    position: "absolute",
    top: space.md,
    left: 0,
    right: 0,
    alignItems: "center",
    // Above the rows it covers. Not `shadow.float`'s layer — see the header.
    zIndex: 1,
    // The layer spans the page's width and the pill does not, so without this
    // the empty half of the row would eat taps meant for the list under it.
    // On `style`, not as a prop: the prop is deprecated and warns on every
    // render.
    pointerEvents: "box-none",
  },
  pill: {
    minHeight: touchTarget.min,
    flexDirection: "row",
    alignItems: "center",
    gap: space.sm,
    paddingHorizontal: space.x3,
    borderRadius: radius.pill,
    backgroundColor: theme.surface,
    // The edge is what says *above the page* here, so it is the strong step
    // rather than the neutral one: this sits on rows, not on the ground.
    borderWidth: 1,
    borderColor: theme.borderStrong,
  },
  focused: {
    outlineWidth: focus.width,
    outlineColor: theme.focusRing,
    outlineOffset: focus.offset,
  },
  label: { color: theme.accentText, ...text.ui("bodySm", 600) },
}));
