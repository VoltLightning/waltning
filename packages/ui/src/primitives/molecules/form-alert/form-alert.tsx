/**
 * `<FormAlert>` — the toast a refused submit raises, at the **top** of the
 * window.
 *
 * **Top, not bottom, and that is the difference from `Toast`.** A submit
 * button is at the bottom of what it submits, so the thumb that pressed it
 * and the keyboard that may still be up are both where a bottom toast would
 * land. The top is the one edge a form never occupies.
 *
 * **It says the form is not ready, never which field.** The fields say that
 * themselves, in their own error lines, and the scroll takes the reader to the
 * first of them; a toast naming one field would be wrong the moment there are
 * two.
 *
 * Danger ink on its pale fill, like a refused `Tag`: the same meaning, drawn
 * the same way. Announced as an alert, so a screen reader hears it without the
 * focus moving off the button.
 */

import { useEffect } from "react";
import { Text, View } from "react-native";
import Animated, { useAnimatedStyle, useSharedValue, withTiming } from "react-native-reanimated";
import { text } from "../../../theme/fonts.ts";
import { makeStyles } from "../../../theme/styles.ts";
import { hairline, motion, radius, space } from "../../../tokens.ts";
import { easing } from "../../easing.ts";
import { useReducedMotion } from "../../reduced-motion.ts";
import { useWindowInsets } from "../../safe-area";

/** How far it drops in from — `Toast`'s own settle, mirrored. */
const ENTER_OFFSET = -8;

export type FormAlertProps = {
  message: string;
  /** A fresh value per raise, so a second refused tap replays the entrance. */
  token: number;
};

export function FormAlert({ message, token }: FormAlertProps) {
  const styles = useStyles();
  const reduced = useReducedMotion();
  const insets = useWindowInsets();
  const ty = useSharedValue(reduced ? 0 : ENTER_OFFSET);
  const opacity = useSharedValue(reduced ? 1 : 0);

  // `token` is the re-arm signal, not a value the body reads.
  // biome-ignore lint/correctness/useExhaustiveDependencies: token replays the entrance by identity.
  useEffect(() => {
    if (reduced) {
      ty.value = 0;
      opacity.value = 1;
      return;
    }
    ty.value = ENTER_OFFSET;
    opacity.value = 0;
    ty.value = withTiming(0, { duration: motion.move.duration, easing: easing.move });
    opacity.value = withTiming(1, { duration: motion.move.duration, easing: easing.move });
  }, [token, reduced, ty, opacity]);

  const motionStyle = useAnimatedStyle(
    () => (reduced ? {} : { transform: [{ translateY: ty.value }], opacity: opacity.value }),
    [reduced, ty, opacity],
  );
  // Per device, so computed here rather than in the theme-keyed styles.
  const place = { top: insets.top + space.xl, left: space.x3, right: space.x3 };

  return (
    <Animated.View
      accessibilityRole="alert"
      accessibilityLiveRegion="assertive"
      pointerEvents="none"
      style={[styles.root, place, motionStyle]}
    >
      <View style={styles.mark} {...HIDDEN}>
        <Text style={styles.markText}>!</Text>
      </View>
      <Text style={styles.message}>{message}</Text>
    </Animated.View>
  );
}

/** `react-native-web` maps neither native hiding prop (`conformance.test.ts`). */
const HIDDEN = {
  "aria-hidden": true,
  accessibilityElementsHidden: true,
  importantForAccessibility: "no-hide-descendants",
} as const;

const useStyles = makeStyles((theme) => ({
  root: {
    position: "absolute",
    flexDirection: "row",
    alignItems: "center",
    gap: space.lg,
    paddingVertical: space.xl,
    paddingHorizontal: space.x3,
    borderRadius: radius.md,
    borderWidth: hairline.width,
    borderColor: theme.dangerBorder,
    backgroundColor: theme.dangerFill,
  },
  // Outlined, not filled: the solid danger fill belongs to the control that
  // destroys something (§2.6c), and this destroys nothing.
  mark: {
    width: 20,
    height: 20,
    borderRadius: radius.sm,
    borderWidth: 1.5,
    borderColor: theme.dangerText,
    alignItems: "center",
    justifyContent: "center",
  },
  markText: { ...text.ui("caption", 700), color: theme.dangerText },
  message: { ...text.ui("bodySm", 600), color: theme.dangerText, flexShrink: 1 },
}));
