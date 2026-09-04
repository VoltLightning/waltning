/**
 * The floating add button — `design-system/02` §2.9.
 *
 * The one object *above* the page: a 56px circle, the only circle on the
 * screen, with the system's only shadow. It sits over the list, over the
 * header, over everything, so nothing ever pushes it away; and it is the
 * user's to place. Drag it and it settles against the nearer side, at the
 * height it was let go, with a bounce that never reaches the edge. Push it
 * off the bottom and it parks as a tab at that column. Tap the tab and it
 * comes back to where it was.
 *
 * **Still a button.** Tap adds, and only a real drag — past a small slop —
 * moves it. The `Pressable` inside is what a keyboard and a screen reader
 * meet: focusable, labelled, activated by Enter, and never asked to drag. The
 * drag is a `Gesture.Pan` around it that activates only after `minDistance`,
 * so a tap never sees it and a drag takes the touch from the press beneath.
 *
 * **The drag never touches the JS thread.** The gesture's callbacks are
 * worklets; the geometry they call is worklets; the position is a pair of
 * shared values the style reads on the UI thread. A list rendering on the JS
 * thread cannot make the button lag the finger — which is the reason this
 * package uses Reanimated and gesture-handler and nothing else for motion.
 * The only crossings are `runOnJS`: the lifted-shadow state on start and
 * end, and the drop, which is a device preference the JS side stores.
 *
 * **Where it is comes from outside.** The component neither reads nor writes
 * storage: it takes `position` (or `null` for the default) and reports every
 * drop through `onPositionChange`. The geometry is `float-geometry.ts`,
 * tested as arithmetic.
 *
 * **The motion, named.** Press is `usePressScale` and nothing more. The drag
 * follows the finger 1:1, with the lifted shadow swapped in at once. Settling
 * is `withSpring` on `settleSpring` — damping solved from the travel so the
 * overshoot stays inside the inset. Parking and returning are `motion.move` —
 * the button *travels* rather than appears. Reduced motion: it still moves,
 * it just arrives.
 */

import { useCallback, useEffect, useMemo, useState } from "react";
import { type LayoutChangeEvent, Pressable, View } from "react-native";
import { Gesture, GestureDetector } from "react-native-gesture-handler";
import Animated, {
  runOnJS,
  useAnimatedStyle,
  useSharedValue,
  withSpring,
  withTiming,
} from "react-native-reanimated";
import { useT } from "../i18n/provider";
import { Button } from "../primitives/button";
import { easing } from "../primitives/easing.ts";
import { useInteraction } from "../primitives/interaction.ts";
import { usePressScale } from "../primitives/press-scale.ts";
import { useReducedMotion } from "../primitives/reduced-motion.ts";
import { useSafeArea } from "../primitives/safe-area";
import { makeStyles } from "../theme/styles.ts";
import { floating, focus, motion, radius, shadow, space, touchTarget } from "../tokens.ts";
import { BottomSheet } from "./bottom-sheet";
import {
  clampFloat,
  defaultFloat,
  dockFrame,
  dragRange,
  type FloatBounds,
  type FloatPosition,
  releaseAt,
  settleSpring,
} from "./float-geometry.ts";

/** S05 §9.1's third entry point — the long-press picker's own three choices. */
export type FloatingAddType = "expense" | "transfer" | "income";

export type FloatingAddProps = {
  onAdd: () => void;
  /** The long-press picker (S05 §9.1) — `Expense` · `Transfer` · `Income`. */
  onSelectType: (type: FloatingAddType) => void;
  disabled?: boolean;
  /** `null` is the default position — bottom-right, inset by the device. */
  position: FloatPosition | null;
  onPositionChange: (next: FloatPosition) => void;
};

/** Finger travel before a touch stops being a tap. */
const DRAG_SLOP = 4;
/** How long a hold has to last before it is a long-press rather than a slow tap. */
const LONG_PRESS_DURATION = 450;

const MOVE = { duration: motion.move.duration, easing: easing.move };

export function FloatingAdd({
  onAdd,
  onSelectType,
  disabled = false,
  position,
  onPositionChange,
}: FloatingAddProps) {
  const t = useT();
  const styles = useStyles();
  const insets = useSafeArea();
  const reduced = useReducedMotion();
  const [bounds, setBounds] = useState<FloatBounds | null>(null);
  const [dragging, setDragging] = useState(false);
  const [typePickerOpen, setTypePickerOpen] = useState(false);

  const onLayout = useCallback((event: LayoutChangeEvent) => {
    const { width, height } = event.nativeEvent.layout;
    setBounds((prev) =>
      prev?.width === width && prev?.height === height ? prev : { width, height },
    );
  }, []);

  const shown =
    bounds === null
      ? null
      : position === null
        ? defaultFloat(bounds, insets)
        : clampFloat(position, bounds, insets);

  // The wrapper's translation, on the UI thread, for the whole life of the
  // component — across parked and floating, so a return can start from the
  // tab. `settling` is true while a spring or a slide owns them.
  const tx = useSharedValue(0);
  const ty = useSharedValue(0);
  const startX = useSharedValue(0);
  const startY = useSharedValue(0);
  const settling = useSharedValue(false);

  // Rest the wrapper where the position says, unless a finger or a tween
  // owns it right now.
  useEffect(() => {
    if (shown === null || shown.dock !== null || dragging || settling.value) return;
    tx.value = shown.x;
    ty.value = shown.y;
  }, [shown, dragging, settling, tx, ty]);

  const finishSettling = useCallback(() => {
    settling.value = false;
  }, [settling]);

  const pan = useMemo(() => {
    const gesture = Gesture.Pan()
      .minDistance(DRAG_SLOP)
      .enabled(bounds !== null && shown !== null)
      .onStart(() => {
        "worklet";
        startX.value = tx.value;
        startY.value = ty.value;
        runOnJS(setDragging)(true);
      })
      .onUpdate((e) => {
        "worklet";
        if (bounds === null) return;
        const r = dragRange(bounds, insets);
        tx.value = Math.min(Math.max(startX.value + e.translationX, r.minX), r.maxX);
        ty.value = Math.min(Math.max(startY.value + e.translationY, r.minY), r.maxY);
      })
      .onEnd((e) => {
        "worklet";
        runOnJS(setDragging)(false);
        if (bounds === null || shown === null) return;
        const x = startX.value + e.translationX;
        const y = startY.value + e.translationY;
        const next = releaseAt(shown, x, y, bounds, insets);
        if (next.dock === null) {
          runOnJS(onPositionChange)(next);
          if (reduced) {
            tx.value = next.x;
            ty.value = next.y;
            return;
          }
          const spring = settleSpring(Math.hypot(next.x - tx.value, next.y - ty.value));
          settling.value = true;
          tx.value = withSpring(next.x, spring);
          ty.value = withSpring(next.y, spring, (finished) => {
            if (finished) runOnJS(finishSettling)();
          });
          return;
        }
        // Slide down into the edge, then become the tab.
        const frame = dockFrame(next.dock, bounds, insets);
        const to = {
          x: frame.x + floating.tab.width / 2 - floating.size / 2,
          y: frame.y + floating.tab.height - floating.size / 2,
        };
        if (reduced) {
          tx.value = to.x;
          ty.value = to.y;
          runOnJS(onPositionChange)(next);
          return;
        }
        settling.value = true;
        tx.value = withTiming(to.x, MOVE);
        ty.value = withTiming(to.y, MOVE, (finished) => {
          if (finished) {
            settling.value = false;
            runOnJS(onPositionChange)(next);
          }
        });
      });
    return gesture;
  }, [
    bounds,
    shown,
    insets,
    reduced,
    onPositionChange,
    finishSettling,
    startX,
    startY,
    tx,
    ty,
    settling,
  ]);

  const openTypePicker = useCallback(() => setTypePickerOpen(true), []);
  const closeTypePicker = useCallback(() => setTypePickerOpen(false), []);

  /**
   * **Exclusive with the pan, not simultaneous.** A finger that moves past
   * `DRAG_SLOP` before `LONG_PRESS_DURATION` is a drag, not a hold — pan's
   * own `minDistance` already fails a hold with no movement, and `Exclusive`
   * is what stops both from racing to activate on the same touch.
   */
  const longPress = useMemo(
    () =>
      Gesture.LongPress()
        .minDuration(LONG_PRESS_DURATION)
        .enabled(bounds !== null && shown !== null && !disabled)
        .onStart(() => {
          "worklet";
          runOnJS(openTypePicker)();
        }),
    [bounds, shown, disabled, openTypePicker],
  );

  const composedGesture = useMemo(() => Gesture.Exclusive(pan, longPress), [pan, longPress]);

  const handleReturn = useCallback(() => {
    if (shown === null || shown.dock === null || bounds === null) return;
    const frame = dockFrame(shown.dock, bounds, insets);
    tx.value = frame.x + floating.tab.width / 2 - floating.size / 2;
    ty.value = frame.y + floating.tab.height - floating.size / 2;
    onPositionChange({ x: shown.x, y: shown.y, dock: null });
    if (reduced) {
      tx.value = shown.x;
      ty.value = shown.y;
      return;
    }
    settling.value = true;
    tx.value = withTiming(shown.x, MOVE);
    ty.value = withTiming(shown.y, MOVE, (finished) => {
      if (finished) runOnJS(finishSettling)();
    });
  }, [shown, bounds, insets, reduced, onPositionChange, finishSettling, settling, tx, ty]);

  const wrapperMotion = useAnimatedStyle(
    () => ({ transform: [{ translateX: tx.value }, { translateY: ty.value }] }),
    [tx, ty],
  );

  return (
    <View style={styles.layer} onLayout={onLayout}>
      {shown === null ? null : shown.dock !== null ? (
        <DockTab
          frame={dockFrame(shown.dock, bounds ?? { width: 0, height: 0 }, insets)}
          onPress={handleReturn}
          label={t("shell.showAdd")}
        />
      ) : (
        <GestureDetector gesture={composedGesture}>
          <Animated.View style={[styles.wrapper, wrapperMotion]}>
            <AddButton
              label={t("shell.add")}
              onPress={onAdd}
              disabled={disabled}
              lifted={dragging}
            />
          </Animated.View>
        </GestureDetector>
      )}
      <TypePicker
        visible={typePickerOpen}
        onDismiss={closeTypePicker}
        onSelectType={onSelectType}
      />
    </View>
  );
}

export type TypePickerProps = {
  visible: boolean;
  onDismiss: () => void;
  onSelectType: (type: FloatingAddType) => void;
};

/** S05 §9.1's third entry point — the long-press picker itself. */
export function TypePicker({ visible, onDismiss, onSelectType }: TypePickerProps) {
  const t = useT();
  const styles = useStyles();

  const handleExpense = useCallback(() => {
    onDismiss();
    onSelectType("expense");
  }, [onDismiss, onSelectType]);
  const handleTransfer = useCallback(() => {
    onDismiss();
    onSelectType("transfer");
  }, [onDismiss, onSelectType]);
  const handleIncome = useCallback(() => {
    onDismiss();
    onSelectType("income");
  }, [onDismiss, onSelectType]);

  return (
    <BottomSheet visible={visible} title={t("shell.addType")} onDismiss={onDismiss}>
      <View style={styles.typePicker}>
        <Button
          label={t("transactions.expense")}
          onPress={handleExpense}
          variant="secondary"
          size="lg"
        />
        <Button
          label={t("transactions.transfer")}
          onPress={handleTransfer}
          variant="secondary"
          size="lg"
        />
        <Button
          label={t("transactions.income")}
          onPress={handleIncome}
          variant="secondary"
          size="lg"
        />
      </View>
    </BottomSheet>
  );
}

type AddButtonProps = { label: string; onPress: () => void; disabled: boolean; lifted: boolean };

function AddButton({ label, onPress, disabled, lifted }: AddButtonProps) {
  const styles = useStyles();
  const press = usePressScale();
  const { focused, handlers } = useInteraction();

  return (
    <Animated.View style={press.style}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={label}
        accessibilityState={{ disabled }}
        disabled={disabled}
        onPress={onPress}
        onPressIn={press.onPressIn}
        onPressOut={press.onPressOut}
        {...handlers}
        style={[
          styles.button,
          lifted ? styles.lifted : styles.resting,
          focused ? styles.focused : null,
          disabled ? styles.inactive : null,
        ]}
      >
        <View style={styles.plusAcross} />
        <View style={styles.plusDown} />
      </Pressable>
    </Animated.View>
  );
}

type DockTabProps = { frame: { x: number; y: number }; onPress: () => void; label: string };

/**
 * The parked tab is 22px tall by design — it sits *on* the edge, not in the
 * page — and §10's floor is 44, so the difference is hit slop above it. Below
 * it is the home indicator, which is the system's.
 */
const TAB_SLOP = { top: touchTarget.min - floating.tab.height };

function DockTab({ frame, onPress, label }: DockTabProps) {
  const styles = useStyles();
  const { focused, handlers } = useInteraction();
  // Computed rather than inline: `frame` is a per-render position, not a
  // theme-scale constant — the same `dock.tsx`/`tag.tsx` shape.
  const position = { left: frame.x, top: frame.y };
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      onPress={onPress}
      hitSlop={TAB_SLOP}
      {...handlers}
      style={[styles.tab, position, focused ? styles.focused : null]}
    >
      <View style={styles.chevronUp} />
    </Pressable>
  );
}

/** A token layer as the platform's `boxShadow` value: hex + alpha, offset, blur. */
function layer(l: { color: string; opacity: number; radius: number; offsetY: number }) {
  const alpha = Math.round(l.opacity * 255)
    .toString(16)
    .padStart(2, "0");
  return { offsetX: 0, offsetY: l.offsetY, blurRadius: l.radius, color: `${l.color}${alpha}` };
}

const useStyles = makeStyles((theme) => ({
  /** `pointerEvents` in the style, not the prop: the prop is deprecated on web. */
  layer: {
    position: "absolute",
    top: 0,
    right: 0,
    bottom: 0,
    left: 0,
    pointerEvents: "box-none",
  },
  wrapper: { position: "absolute", top: 0, left: 0 },
  button: {
    width: floating.size,
    height: floating.size,
    borderRadius: radius.pill,
    backgroundColor: theme.accent,
    alignItems: "center",
    justifyContent: "center",
  },
  resting: {
    boxShadow: [layer(shadow.float.contact), layer(shadow.float.mid), layer(shadow.float.far)],
  },
  lifted: {
    boxShadow: [
      layer(shadow.floatLifted.contact),
      layer(shadow.floatLifted.mid),
      layer(shadow.floatLifted.far),
    ],
  },
  focused: {
    outlineWidth: focus.width,
    outlineColor: theme.focusRing,
    outlineOffset: focus.offset,
  },
  /** Fading a whole control is the one legal use of opacity (`architecture/11`). */
  inactive: { opacity: 0.45 },
  /** The plus, drawn: two 2px bars in the label ink, crisp in every face. */
  plusAcross: { position: "absolute", width: 20, height: 2, backgroundColor: theme.textOnAccent },
  plusDown: { position: "absolute", width: 2, height: 20, backgroundColor: theme.textOnAccent },
  tab: {
    position: "absolute",
    width: floating.tab.width,
    height: floating.tab.height,
    borderTopLeftRadius: radius.sm,
    borderTopRightRadius: radius.sm,
    backgroundColor: theme.accent,
    alignItems: "center",
    justifyContent: "center",
  },
  /** Two borders rotated to point up — the chevron `Select` draws, turned. */
  chevronUp: {
    width: 8,
    height: 8,
    marginTop: 4,
    borderRightWidth: 1.5,
    borderBottomWidth: 1.5,
    borderColor: theme.textOnAccent,
    transform: [{ rotate: "225deg" }],
  },
  typePicker: { gap: space.md },
}));
