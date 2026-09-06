/**
 * `<Checkbox>` — `design-system/03` §3.8. Independent yes/no facts.
 *
 * Checkboxes are for options that do not exclude each other — each row is its
 * own answer. One exclusive choice is `Radio`; a partition of everything into
 * exactly one bucket is `SegmentControl`; a live state with an immediate
 * effect is `Toggle`. Four controls, four different promises to the reader.
 *
 * **The check pops in; it does not fade.** Scale from .4 with `motion.fast`'s
 * strong ease-out — most of the travel in the first third, which reads as the
 * mark *landing*. The box's fill swaps instantly underneath for the same
 * reason the toggle's track does: the confirmation is immediate, the picture
 * settles after. Unchecking is instant both ways — the absence of a mark is
 * not a picture worth animating.
 *
 * **The mark is drawn, not typed.** A ✓ glyph is whatever the fallback font
 * says it is; two borders rotated 45° are the same mark in every face and
 * every theme, in `textOnAccent` because it sits on the accent fill.
 */

import { useCallback, useEffect } from "react";
import { Pressable, Text, View } from "react-native";
import Animated, { useAnimatedStyle, useSharedValue, withTiming } from "react-native-reanimated";
import { text } from "../theme/fonts.ts";
import { makeStyles } from "../theme/styles.ts";
import { focus, motion, radius, space, touchTarget } from "../tokens.ts";
import { easing } from "./easing.ts";
import { useInteraction } from "./interaction.ts";
import { useReducedMotion } from "./reduced-motion.ts";

export type CheckboxProps = {
  /** The accessible name and the visible row label. */
  label: string;
  checked: boolean;
  onChange: (checked: boolean) => void;
  /** A quieter second line under the label. */
  hint?: string;
  disabled?: boolean;
};

const BOX = 22;

export function Checkbox({ label, checked, onChange, hint, disabled = false }: CheckboxProps) {
  const styles = useStyles();
  const { hovered, focused, handlers } = useInteraction();
  const reduced = useReducedMotion();

  const pop = useSharedValue(checked ? 1 : 0);

  useEffect(() => {
    if (checked) {
      pop.value = 0.4;
      pop.value = withTiming(1, {
        duration: reduced ? motion.none.duration : motion.fast.duration,
        easing: easing.fast,
      });
    } else {
      pop.value = 0;
    }
  }, [checked, pop, reduced]);

  // Opacity tracks the same value as scale, so the mark cannot be caught
  // mid-pop at full size and zero presence.
  const markMotion = useAnimatedStyle(
    () => ({ opacity: pop.value, transform: [{ scale: pop.value }, { rotate: "-45deg" }] }),
    [pop],
  );

  const handlePress = useCallback(() => onChange(!checked), [checked, onChange]);

  return (
    <Pressable
      accessibilityRole="checkbox"
      accessibilityLabel={label}
      accessibilityState={{ checked, disabled }}
      // The ARIA prop too — react-native-web drops `checked` from a
      // Pressable's accessibilityState (see chip.tsx).
      aria-checked={checked}
      disabled={disabled}
      onPress={handlePress}
      {...handlers}
      style={[
        styles.row,
        hovered && !disabled ? styles.hovered : null,
        focused ? styles.focused : null,
        disabled ? styles.disabled : null,
      ]}
    >
      <View style={[styles.box, checked ? styles.boxChecked : null]}>
        <Animated.View style={[styles.mark, markMotion]} />
      </View>
      <View style={styles.copy}>
        <Text style={styles.label}>{label}</Text>
        {hint === undefined ? null : <Text style={styles.hint}>{hint}</Text>}
      </View>
    </Pressable>
  );
}

const useStyles = makeStyles((theme) => ({
  row: {
    minHeight: touchTarget.min,
    flexDirection: "row",
    alignItems: "center",
    gap: space.x3,
    borderRadius: radius.sm,
    // **No horizontal padding: the control's left edge is the form's.** A
    // row inset by 8 put Own/Shared, Business and every checkbox list a
    // step further in than the fields above and below them, which reads as
    // a nested block rather than as the next question. The row's own hover
    // fill runs the full width instead, which is what a full-width target
    // should look like.
    paddingVertical: space.sm,
  },
  hovered: { backgroundColor: theme.hoverFill },
  focused: {
    outlineWidth: focus.width,
    outlineColor: theme.focusRing,
    outlineOffset: focus.offset,
  },
  disabled: { opacity: 0.45 },
  box: {
    width: BOX,
    height: BOX,
    borderRadius: radius.xs,
    borderWidth: 1.5,
    borderColor: theme.borderInteractive,
    backgroundColor: theme.surface,
    alignItems: "center",
    justifyContent: "center",
  },
  boxChecked: { backgroundColor: theme.accent, borderColor: theme.accent },
  /** Two borders, rotated: an 11×6 corner that reads as a check. */
  mark: {
    width: 11,
    height: 6,
    borderLeftWidth: 2,
    borderBottomWidth: 2,
    borderColor: theme.textOnAccent,
    // Optical centre: the stroke's corner sits low-left, so the shape needs a
    // nudge up to look centred inside the box.
    marginTop: -2,
  },
  copy: { flex: 1, gap: space.xxs },
  label: { color: theme.text, ...text.ui("body") },
  hint: { color: theme.textMuted, ...text.ui("caption") },
}));
