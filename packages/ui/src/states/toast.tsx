/**
 * `<Toast>` and `<UndoToast>` — `design-system/08` §8.4.
 *
 * `Toast`: a message, 4 s, dismiss. `UndoToast`: a message, an `Undo`, 8 s.
 * **Rapid repeats collapse into one toast with a count** rather than stacking
 * — the caller re-renders the same `UndoToast` with a new `message`/`count`
 * pair, and `count` renders as `×3` beside it, so *"3 rows accepted · Undo"*
 * reads as one growing action rather than three toasts fighting for the same
 * corner of the screen. **`token`, not `message`/`count`, is each window's
 * `resetKey` (H1)** — two shows can share a message and a count (or
 * neither), so only a value the caller is required to change on every show
 * re-arms `useTimer` reliably. `Toast` takes the same required `token` for
 * the same reason: a plain toast re-shown with an identical `message` (the
 * same validation error twice, say) is otherwise indistinguishable from a
 * re-render of the one already on screen.
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

import { useCallback, useEffect, useRef } from "react";
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
 *
 * **`exiting` gates `exit()` to its first call (C1).** A manual dismiss/undo
 * and the auto-expiry timer can both reach `exit()` for the same toast — the
 * timer's own cancellation (`use-timer.ts`) closes that race for the normal
 * case, but reduced motion's `onComplete()` runs synchronously with nothing
 * async to interrupt, so a double-tap on the action reaches `exit()` twice
 * before either caller can know the first already fired. Once `exiting` is
 * set, every later call — timer or a second tap — is a no-op: it can neither
 * re-fire the caller's callback nor restart/overwrite the one animation
 * already in flight.
 */
function useToastMotion<TResetKey>(reduced: boolean, resetKey?: TResetKey) {
  const ty = useSharedValue(reduced ? 0 : ENTER_OFFSET);
  const opacity = useSharedValue(reduced ? 1 : 0);
  const exiting = useRef(false);

  // Re-arms when `reduced` changes or the caller's `resetKey` changes (a
  // fresh `token` on a repeat, H1) — a re-render with neither is the same
  // toast instance and must not replay the slide. `resetKey` is not read in
  // the body, same as `useTimer`'s own — it is the re-arm signal itself.
  // biome-ignore lint/correctness/useExhaustiveDependencies: resetKey re-arms the entrance by identity, not by being read.
  useEffect(() => {
    exiting.current = false;
    if (reduced) {
      ty.value = 0;
      opacity.value = 1;
      return;
    }
    ty.value = ENTER_OFFSET;
    opacity.value = 0;
    ty.value = withTiming(0, { duration: motion.move.duration, easing: easing.move });
    opacity.value = withTiming(1, { duration: motion.move.duration, easing: easing.move });
  }, [reduced, resetKey, ty, opacity]);

  const style = useAnimatedStyle(
    () => (reduced ? {} : { transform: [{ translateY: ty.value }], opacity: opacity.value }),
    [reduced, ty, opacity],
  );

  const exit = useCallback(
    (onComplete: () => void) => {
      if (exiting.current) return;
      exiting.current = true;
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
  /**
   * Incremented by the caller on every show (H1) — the same re-arm signal
   * `UndoToast.token` is. `message` alone under-counts: two shows can carry
   * the same text (a repeated validation error, the same archive message
   * twice), and `useTimer`/`useToastMotion` keyed on it would then treat the
   * second show as a no-op re-render instead of a fresh 4 s window.
   */
  token: number;
};

export function Toast({ message, onDismiss, token }: ToastProps) {
  const t = useT();
  const styles = useStyles();
  const reduced = useReducedMotion();
  const insets = useSafeArea();
  const toastMotion = useToastMotion(reduced, token);
  const cancelRef = useRef<() => void>(() => {});

  const handleDismiss = useCallback(() => {
    cancelRef.current();
    toastMotion.exit(onDismiss);
  }, [toastMotion, onDismiss]);
  cancelRef.current = useTimer(TOAST_MS, handleDismiss, token);

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
  /**
   * Incremented by the caller on every show (H1) — the 8 s window's own
   * `resetKey`. Two toasts sharing a `message` (and no `count` change) were
   * indistinguishable to `useTimer`, so the second show did not re-arm the
   * window and could dismiss almost immediately. `token` is required rather
   * than derived from `message`/`count` because those two are allowed to
   * repeat identically between shows; `token` never does.
   */
  token: number;
};

export function UndoToast({ message, onUndo, onDismiss, count, token }: UndoToastProps) {
  const t = useT();
  const styles = useStyles();
  const reduced = useReducedMotion();
  const insets = useSafeArea();
  const toastMotion = useToastMotion(reduced, token);
  const cancelRef = useRef<() => void>(() => {});

  const handleDismiss = useCallback(() => {
    cancelRef.current();
    toastMotion.exit(onDismiss);
  }, [toastMotion, onDismiss]);
  const handleUndo = useCallback(() => {
    cancelRef.current();
    toastMotion.exit(onUndo);
  }, [toastMotion, onUndo]);
  cancelRef.current = useTimer(UNDO_MS, handleDismiss, token);

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
