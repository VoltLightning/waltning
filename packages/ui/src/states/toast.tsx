/**
 * `<Toast>` and `<UndoToast>` — `design-system/08` §8.4.
 *
 * `Toast`: a message, 4 s, dismiss. `UndoToast`: a message, an `Undo`, 8 s.
 * **Rapid repeats collapse into one toast with a count** rather than stacking
 * — the caller re-renders the same `UndoToast` with a new `message`/`count`
 * pair, and `count` both restarts the 8 s window (via `useTimer`'s
 * `resetKey`) and renders as `×3` beside it, so *"3 rows accepted · Undo"*
 * reads as one growing action rather than three toasts fighting for the same
 * corner of the screen.
 *
 * **Slide in on `translateY` alone**, at `motion.move` — the entrance is
 * something *moving into place*, not appearing, which is `motion.move`'s
 * whole distinction from `motion.base` (`tokens.ts` §2.7). Reduced motion
 * renders with no `transform` key at all, rather than the same transform at
 * zero duration: a component test can assert the key's absence directly,
 * where a zero-duration transform would still be a transform to inspect.
 *
 * **The action is not `<Button variant="ghost">`.** Ghost's ink is
 * `theme.textMuted`, tuned for the light `ground`/`surface` steps every other
 * ghost button sits on — on the toast's `theme.shell` fill it measured 1.58:1
 * against 4.5. A toast is the one component that is *always* on the shell
 * colour, so its action gets the shell's own ink rather than a shared
 * primitive built for a different surface.
 */

import { useEffect } from "react";
import { Pressable, Text } from "react-native";
import Animated, { useAnimatedStyle, useSharedValue, withTiming } from "react-native-reanimated";
import { useT } from "../i18n/provider";
import { easing } from "../primitives/easing.ts";
import { useInteraction } from "../primitives/interaction.ts";
import { usePressScale } from "../primitives/press-scale.ts";
import { useReducedMotion } from "../primitives/reduced-motion.ts";
import { text } from "../theme/fonts.ts";
import { makeStyles } from "../theme/styles.ts";
import { focus, motion, radius, space, touchTarget } from "../tokens.ts";
import { useTimer } from "./use-timer.ts";

/** §10's floor belongs to the target, not the drawn label — `hitSlop` fills the gap. */
const ACTION_HEIGHT = 24;
const ACTION_SLOP = Math.max(0, (touchTarget.min - ACTION_HEIGHT) / 2);

const TOAST_MS = 4_000;
const UNDO_MS = 8_000;
const OFFSET = 24;

function useSlideIn() {
  const reduced = useReducedMotion();
  const ty = useSharedValue(reduced ? 0 : OFFSET);

  useEffect(() => {
    if (reduced) {
      ty.value = 0;
      return;
    }
    ty.value = OFFSET;
    ty.value = withTiming(0, { duration: motion.move.duration, easing: easing.move });
    // Re-arms only when `reduced` changes — a re-render of the same toast
    // instance (a repeat collapsing into it) does not replay the slide.
  }, [reduced, ty]);

  return useAnimatedStyle(
    () => (reduced ? {} : { transform: [{ translateY: ty.value }] }),
    [reduced, ty],
  );
}

type ToastActionProps = { label: string; onPress: () => void };

function ToastAction({ label, onPress }: ToastActionProps) {
  const styles = useStyles();
  const press = usePressScale();
  const { focused, handlers } = useInteraction();

  return (
    <Animated.View style={press.style}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={label}
        onPress={onPress}
        onPressIn={press.onPressIn}
        onPressOut={press.onPressOut}
        {...handlers}
        hitSlop={ACTION_SLOP}
        style={[styles.action, focused ? styles.actionFocused : null]}
      >
        <Text style={styles.actionLabel}>{label}</Text>
      </Pressable>
    </Animated.View>
  );
}

export type ToastProps = {
  message: string;
  onDismiss: () => void;
};

export function Toast({ message, onDismiss }: ToastProps) {
  const t = useT();
  const styles = useStyles();
  const motionStyle = useSlideIn();
  useTimer(TOAST_MS, onDismiss, message);

  return (
    <Animated.View accessibilityRole="alert" style={[styles.root, motionStyle]}>
      <Text style={styles.message}>{message}</Text>
      <ToastAction label={t("states.toast.dismiss")} onPress={onDismiss} />
    </Animated.View>
  );
}

export type UndoToastProps = {
  message: string;
  onUndo: () => void;
  onDismiss: () => void;
  /** Rapid repeats collapse into one toast; the count they collapsed to. */
  count?: number;
};

export function UndoToast({ message, onUndo, onDismiss, count }: UndoToastProps) {
  const t = useT();
  const styles = useStyles();
  const motionStyle = useSlideIn();
  useTimer(UNDO_MS, onDismiss, count ?? message);

  return (
    <Animated.View accessibilityRole="alert" style={[styles.root, motionStyle]}>
      <Text style={styles.message}>
        {message}
        {count !== undefined && count > 1 ? (
          <Text style={styles.count}> {t("states.toast.repeatCount", { count })}</Text>
        ) : null}
      </Text>
      <ToastAction label={t("states.undo")} onPress={onUndo} />
    </Animated.View>
  );
}

const useStyles = makeStyles((theme) => ({
  root: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: space.x3,
    borderRadius: radius.md,
    backgroundColor: theme.shell,
    paddingVertical: space.xl,
    paddingHorizontal: space.x3,
  },
  message: { ...text.ui("body"), color: theme.shellText, flexShrink: 1 },
  count: { ...text.ui("body", 600), color: theme.shellTextMuted },
  action: { paddingVertical: space.xs, paddingHorizontal: space.sm, borderRadius: radius.sm },
  actionFocused: {
    outlineWidth: focus.width,
    outlineColor: theme.shellText,
    outlineOffset: focus.offset,
  },
  actionLabel: { ...text.ui("body", 600), color: theme.shellText },
}));
