/**
 * `<Toggle>` — `design-system/03` §3.7. On or off, and nothing in between.
 *
 * A toggle is for a **state**, not an action: business / personal, write a
 * rule, S33's master switch. An action that happens once wants a `Button`; a
 * choice among several wants `Radio` or `SegmentControl`. The distinction is
 * what the switch role announces — a reader says "on" or "off", not "pressed".
 *
 * **The thumb slides; the track swaps.** The slide is a transform on the
 * native driver (`motion.base` in the §2.7 table — this is a thing already
 * visible, moving). The track's colour change is an instant swap underneath
 * it, because animating colour leaves the native driver and the two running at
 * different clocks reads as the thumb outrunning its own background. The swap
 * happens at the moment of press, the slide catches up — which is exactly the
 * asymmetry `press-scale` already established: the system answers instantly,
 * the picture settles after.
 *
 * **The label is part of the target.** A bare 44×26 track is a fiddly target
 * and an unlabelled control; the whole row is pressable and the row carries
 * the 44pt floor (§10).
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

export type ToggleProps = {
  /** The accessible name and the visible row label. */
  label: string;
  value: boolean;
  onChange: (value: boolean) => void;
  /** A quieter second line — what turning it on means. */
  hint?: string;
  disabled?: boolean;
};

/** Track 44×26, thumb 22, 2px inset: the thumb travels 18. */
const TRACK_WIDTH = 44;
const TRACK_HEIGHT = 26;
const THUMB = 22;
const TRACK_INSET = 1;
const TRAVEL = TRACK_WIDTH - THUMB - 2 * (TRACK_INSET + 1); // inset + border, both sides

export function Toggle({ label, value, onChange, hint, disabled = false }: ToggleProps) {
  const styles = useStyles();
  const { hovered, focused, handlers } = useInteraction();
  const reduced = useReducedMotion();

  const progress = useSharedValue(value ? 1 : 0);

  useEffect(() => {
    progress.value = withTiming(value ? 1 : 0, {
      // The motion-none branch: same path, zero duration (§2.7).
      duration: reduced ? motion.none.duration : motion.base.duration,
      easing: easing.base,
    });
  }, [progress, reduced, value]);

  const thumbMotion = useAnimatedStyle(
    () => ({ transform: [{ translateX: progress.value * TRAVEL }] }),
    [progress],
  );

  const handlePress = useCallback(() => onChange(!value), [onChange, value]);

  return (
    <Pressable
      accessibilityRole="switch"
      accessibilityLabel={label}
      accessibilityState={{ checked: value, disabled }}
      // The ARIA prop too — react-native-web drops `checked` from a
      // Pressable's accessibilityState (see chip.tsx).
      aria-checked={value}
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
      <View style={styles.copy}>
        <Text style={styles.label}>{label}</Text>
        {hint === undefined ? null : <Text style={styles.hint}>{hint}</Text>}
      </View>
      <View style={[styles.track, value ? styles.trackOn : null]}>
        <Animated.View style={[styles.thumb, value ? styles.thumbOn : null, thumbMotion]} />
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
  copy: { flex: 1, gap: space.xxs },
  label: { color: theme.text, ...text.ui("body") },
  hint: { color: theme.textMuted, ...text.ui("caption") },
  track: {
    width: TRACK_WIDTH,
    height: TRACK_HEIGHT,
    borderRadius: radius.pill,
    backgroundColor: theme.subtleFill,
    borderWidth: 1,
    // Off must read without colour: the outline is the off state's edge, and
    // it is `borderInteractive` because a toggle is a control at rest.
    borderColor: theme.borderInteractive,
    justifyContent: "center",
    padding: TRACK_INSET,
  },
  trackOn: { backgroundColor: theme.accent, borderColor: theme.accent },
  thumb: {
    width: THUMB,
    height: THUMB,
    borderRadius: radius.pill,
    backgroundColor: theme.surface,
    borderWidth: 1,
    borderColor: theme.border,
  },
  // On the accent track the thumb is the accent's own ink — a white thumb on
  // light, and whatever `textOnAccent` resolves to in dark, where `surface`
  // would vanish into the fill.
  thumbOn: { backgroundColor: theme.textOnAccent, borderColor: theme.accent },
}));
