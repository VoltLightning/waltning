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
 * **It floats, and changes no layout.** The list under it is infinite in both
 * directions, so the pill must be somewhere the reader never scrolls away from
 * — and it is shown while the anchor is off today, which changes on every
 * scroll settle. A band reserved for it above the rows dropped every row by
 * the pill's height one day off today and lifted them again on the way back;
 * a floated pill moves nothing.
 *
 * **Not `shadow.float`.** §2.5 reserves that for the add button, and
 * `<Toast>` extended it once to the second thing that sits above the *screen*.
 * This sits above the *list* — inside the page, under its own chrome — so it
 * reads as raised by its edge and its fill, the way every other surface in this
 * system does. A third float would leave the token meaning "important" rather
 * than "above the page".
 *
 * **On the add button's line, on the side it is not.** The button is draggable to
 * either side edge (§2.9) and defaults to bottom-right; the pill sits opposite it, centred on the same line with the
 * same inset from the list's bottom edge. The list already ends with the
 * button's clearance (`useFloatingClearance`), so at the end of the list the
 * pill covers nothing, exactly as the button does; mid-scroll it overlaps
 * rows as the button does.
 */

import { useEffect } from "react";
import { Text, View } from "react-native";
import Animated, { useAnimatedStyle, useSharedValue, withTiming } from "react-native-reanimated";
import { PressableScaled } from "../../../primitives/atoms/pressable-scaled/pressable-scaled";
import { easing } from "../../../primitives/easing.ts";
import { useInteraction } from "../../../primitives/interaction.ts";
import { useReducedMotion } from "../../../primitives/reduced-motion.ts";
import { focusBorder } from "../../../theme/focus.ts";
import { text } from "../../../theme/fonts.ts";
import { useTheme } from "../../../theme/provider";
import { makeStyles } from "../../../theme/styles.ts";
import { floating, motion, radius, space, touchTarget } from "../../../tokens.ts";
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
  /**
   * The side it rests on — **the one the add button is not on.** The button is
   * draggable to either side edge, and a pill under it would hide the only way
   * back from a jump. Default `left`: the button's own default is bottom-right.
   */
  side?: "left" | "right";
};

export function TodayPill({ label, accessibilityLabel, onPress, side = "left" }: TodayPillProps) {
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
  const ty = useSharedValue(reduced ? 0 : ENTER_OFFSET);
  useEffect(() => {
    if (reduced) {
      ty.value = 0;
      return;
    }
    ty.value = withTiming(0, { duration: motion.move.duration, easing: easing.move });
  }, [reduced, ty]);

  // Up from below: it arrives from the edge it rests against.
  const entrance = useAnimatedStyle(() => ({ transform: [{ translateY: ty.value }] }));

  return (
    // The layer is the positioned box and holds the pill at its own width. A
    // `left: 0; right: 0` pill would be a full-width bar, which is a banner.
    <View style={[styles.layer, side === "left" ? styles.left : styles.right]}>
      <Animated.View style={entrance}>
        <PressableScaled
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
        </PressableScaled>
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
    // The add button's line: its inset from the bottom, and its centre — the
    // button is 56 tall and the pill a 44pt target.
    bottom: floating.inset + (floating.size - touchTarget.min) / 2,
    // Above the rows it covers. Not `shadow.float`'s layer — see the header.
    zIndex: 1,
    // On `style`, not as a prop: the prop is deprecated and warns on every
    // render.
    pointerEvents: "box-none",
  },
  left: { left: floating.inset },
  right: { right: floating.inset },
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
  focused: focusBorder(theme.focusRing, { horizontal: space.x3 }),
  label: { color: theme.accentText, ...text.ui("bodySm", 600) },
}));
