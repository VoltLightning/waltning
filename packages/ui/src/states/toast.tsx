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
 * **It floats — the owner's own words: *"not pronounced, should be easier to
 * distinguish from the main UI"*.** It used to be a flush, full-width bar on
 * `theme.shell`, which read as another row of the page rather than something
 * laid over it. Now it is inset `space.x3` from both side edges and the
 * bottom safe area, and it carries `shadow-float` — `02-tokens.md` §2.5's one
 * shadow, until now reserved for the add button alone and extended here to
 * the second thing that sits *above* the page rather than in its layout. A
 * leading drawn check (`theme.shellText`, decorative — the message text is
 * still the one thing that says what happened, P5) makes the toast read as
 * its own object at a glance, before the words are read at all.
 *
 * **Slide up 8px and fade in on `motion.move`; exit is the reverse.** The
 * old version only slid — `useToastMotion` adds the fade and an `exit()` that
 * plays the reverse before the caller's dismiss/undo actually fires, so what
 * the eye saw arrive is what it sees leave. Reduced motion: both instant,
 * `exit()` calling the callback with no animation at all — a component test
 * can assert the transform key's absence directly, the way it already could
 * for the entrance.
 *
 * **The action is not `<Button variant="ghost">`.** Ghost's ink is
 * `theme.textMuted`, tuned for the light `ground`/`surface` steps every other
 * ghost button sits on — on the toast's `theme.shell` fill it measured 1.58:1
 * against 4.5. A toast is the one component that is *always* on the shell
 * colour, so its action gets the shell's own ink rather than a shared
 * primitive built for a different surface.
 */

import { useCallback, useEffect } from "react";
import { Pressable, Text, View } from "react-native";
import Animated, {
  runOnJS,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from "react-native-reanimated";
import { useT } from "../i18n/provider";
import { easing } from "../primitives/easing.ts";
import { useInteraction } from "../primitives/interaction.ts";
import { usePressScale } from "../primitives/press-scale.ts";
import { useReducedMotion } from "../primitives/reduced-motion.ts";
import { useSafeArea } from "../primitives/safe-area";
import { text } from "../theme/fonts.ts";
import { makeStyles } from "../theme/styles.ts";
import { focus, motion, radius, shadow, space, touchTarget } from "../tokens.ts";
import { useTimer } from "./use-timer.ts";

/** §10's floor belongs to the target, not the drawn label — `hitSlop` fills the gap. */
const ACTION_HEIGHT = 24;
const ACTION_SLOP = Math.max(0, (touchTarget.min - ACTION_HEIGHT) / 2);

const TOAST_MS = 4_000;
const UNDO_MS = 8_000;
/** The slide distance — 8px, not the old 24: an object settling into place, not travelling far. */
const ENTER_OFFSET = 8;

/**
 * Slide + fade, both directions, and the `motion-none` branch.
 *
 * `exit()` takes the caller's real dismiss/undo callback and plays the
 * reverse of the entrance before calling it — so the toast is still on
 * screen, animating out, for the moment between the tap and the unmount,
 * rather than vanishing the instant the caller flips its `visible` state.
 */
function useToastMotion(reduced: boolean) {
  const ty = useSharedValue(reduced ? 0 : ENTER_OFFSET);
  const opacity = useSharedValue(reduced ? 1 : 0);

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
    // Re-arms only when `reduced` changes — a re-render of the same toast
    // instance (a repeat collapsing into it) does not replay the slide.
  }, [reduced, ty, opacity]);

  const style = useAnimatedStyle(
    () => (reduced ? {} : { transform: [{ translateY: ty.value }], opacity: opacity.value }),
    [reduced, ty, opacity],
  );

  const exit = useCallback(
    (onComplete: () => void) => {
      if (reduced) {
        onComplete();
        return;
      }
      ty.value = withTiming(ENTER_OFFSET, { duration: motion.move.duration, easing: easing.move });
      opacity.value = withTiming(
        0,
        { duration: motion.move.duration, easing: easing.move },
        (finished) => {
          if (finished) runOnJS(onComplete)();
        },
      );
    },
    [reduced, ty, opacity],
  );

  return { style, exit };
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

/** Decorative — the message text is the one thing that says what happened (P5). */
function StatusMark() {
  const styles = useStyles();
  return (
    <View
      testID="toast-mark"
      style={styles.mark}
      accessibilityElementsHidden
      importantForAccessibility="no"
    >
      <View style={styles.markCheck} />
    </View>
  );
}

export type ToastProps = {
  message: string;
  onDismiss: () => void;
};

export function Toast({ message, onDismiss }: ToastProps) {
  const t = useT();
  const styles = useStyles();
  const reduced = useReducedMotion();
  const insets = useSafeArea();
  const toastMotion = useToastMotion(reduced);

  const handleDismiss = useCallback(() => toastMotion.exit(onDismiss), [toastMotion, onDismiss]);
  useTimer(TOAST_MS, handleDismiss, message);

  // Computed rather than cached in `useStyles`: the inset is per-device, and
  // a theme-keyed cache would hand the second device the first one's home
  // indicator (`dock.tsx`'s own `clearance` does the same).
  const floatPosition = { left: space.x3, right: space.x3, bottom: insets.bottom + space.x3 };

  return (
    <Animated.View
      accessibilityRole="alert"
      style={[styles.root, styles.elevation, floatPosition, toastMotion.style]}
    >
      <View style={styles.content}>
        <StatusMark />
        <Text style={styles.message}>{message}</Text>
      </View>
      <ToastAction label={t("states.toast.dismiss")} onPress={handleDismiss} />
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
  const reduced = useReducedMotion();
  const insets = useSafeArea();
  const toastMotion = useToastMotion(reduced);

  const handleDismiss = useCallback(() => toastMotion.exit(onDismiss), [toastMotion, onDismiss]);
  const handleUndo = useCallback(() => toastMotion.exit(onUndo), [toastMotion, onUndo]);
  useTimer(UNDO_MS, handleDismiss, count ?? message);

  const floatPosition = { left: space.x3, right: space.x3, bottom: insets.bottom + space.x3 };

  return (
    <Animated.View
      accessibilityRole="alert"
      style={[styles.root, styles.elevation, floatPosition, toastMotion.style]}
    >
      <View style={styles.content}>
        <StatusMark />
        <Text style={styles.message}>
          {message}
          {count !== undefined && count > 1 ? (
            <Text style={styles.count}> {t("states.toast.repeatCount", { count })}</Text>
          ) : null}
        </Text>
      </View>
      <ToastAction label={t("states.undo")} onPress={handleUndo} />
    </Animated.View>
  );
}

/** A token layer as the platform's `boxShadow` value: hex + alpha, offset, blur.
 *  Duplicated from `shell/floating-add.tsx` rather than shared — the toast is
 *  only the second caller, and the rule against an abstraction is "before the
 *  third use", not "before the second". */
function layer(l: { color: string; opacity: number; radius: number; offsetY: number }) {
  const alpha = Math.round(l.opacity * 255)
    .toString(16)
    .padStart(2, "0");
  return { offsetX: 0, offsetY: l.offsetY, blurRadius: l.radius, color: `${l.color}${alpha}` };
}

const useStyles = makeStyles((theme) => ({
  root: {
    position: "absolute",
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: space.x3,
    borderRadius: radius.md,
    backgroundColor: theme.shell,
    paddingVertical: space.xl,
    paddingHorizontal: space.x3,
  },
  elevation: {
    boxShadow: [layer(shadow.float.contact), layer(shadow.float.mid), layer(shadow.float.far)],
  },
  content: { flexDirection: "row", alignItems: "center", gap: space.sm, flexShrink: 1 },
  mark: { width: 16, height: 16, alignItems: "center", justifyContent: "center" },
  markCheck: {
    width: 11,
    height: 6,
    borderLeftWidth: 2,
    borderBottomWidth: 2,
    borderColor: theme.shellText,
    transform: [{ rotate: "-45deg" }],
    marginTop: -2,
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
