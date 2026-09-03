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
 * gesture lives on the wrapper as a `PanResponder`, which claims the touch
 * only once it has moved, so a tap never sees it and a drag cancels the press
 * underneath. `PanResponder` is React Native's own responder plumbing and
 * runs unchanged under `react-native-web`, which is why this is one file with
 * no platform variant.
 *
 * **Where it is comes from outside.** The position is a device preference —
 * stored like appearance, never a registry operation, never synced — and the
 * component neither reads nor writes storage: it takes `position` (or `null`
 * for the default) and reports every drop through `onPositionChange`. The
 * geometry is `float-geometry.ts`, tested as arithmetic.
 *
 * **The motion, named.** Press is `usePressScale` and nothing more. The drag
 * is unanimated, following the finger 1:1, with the lifted shadow swapped in
 * at once. Settling is a spring (`settleSpring` — its damping is solved from
 * the travel so the overshoot stays inside the inset). Parking and returning
 * are `motion.move` — the button *travels* rather than appears. Reduced
 * motion: it still moves, it just arrives.
 */

import { useCallback, useEffect, useRef, useState } from "react";
import { Animated, type LayoutChangeEvent, PanResponder, Pressable, View } from "react-native";
import { useT } from "../i18n/provider";
import { easing } from "../primitives/easing.ts";
import { useInteraction } from "../primitives/interaction.ts";
import { usePressScale } from "../primitives/press-scale.ts";
import { useReducedMotion } from "../primitives/reduced-motion.ts";
import { useSafeArea } from "../primitives/safe-area";
import { makeStyles } from "../theme/styles.ts";
import { floating, focus, motion, radius, shadow, touchTarget } from "../tokens.ts";
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

export type FloatingAddProps = {
  onAdd: () => void;
  disabled?: boolean;
  /** `null` is the default position — bottom-right, inset by the device. */
  position: FloatPosition | null;
  onPositionChange: (next: FloatPosition) => void;
};

/** Finger travel before a touch stops being a tap. */
const DRAG_SLOP = 4;

export function FloatingAdd({
  onAdd,
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

  // The wrapper's translation. One value for the whole life of the component,
  // across parked and floating, so a return can start from the tab.
  const pan = useRef(new Animated.ValueXY()).current;
  // What the responder needs at release time, without stale closures: the
  // handlers are created once and read these.
  const live = useRef({
    shown,
    bounds,
    insets,
    onPositionChange,
    reduced,
    busy: false,
    start: { x: 0, y: 0 },
    down: { x: 0, y: 0 },
  });
  live.current.shown = shown;
  live.current.bounds = bounds;
  live.current.insets = insets;
  live.current.onPositionChange = onPositionChange;
  live.current.reduced = reduced;

  // Rest the wrapper where the position says, unless a finger or a tween owns
  // it right now.
  useEffect(() => {
    if (shown === null || shown.dock !== null || dragging || live.current.busy) return;
    pan.setValue({ x: shown.x, y: shown.y });
  }, [shown, dragging, pan]);

  const travel = useCallback(
    (to: { x: number; y: number }, then: () => void) => {
      if (live.current.reduced) {
        pan.setValue(to);
        then();
        return;
      }
      live.current.busy = true;
      Animated.timing(pan, {
        toValue: to,
        duration: motion.move.duration,
        easing: easing.move,
        useNativeDriver: true,
      }).start(() => {
        live.current.busy = false;
        then();
      });
    },
    [pan],
  );

  /** From the drop point to the rest, on a spring sized to the distance. */
  const settle = useCallback(
    (from: { x: number; y: number }, to: { x: number; y: number }) => {
      if (live.current.reduced) {
        pan.setValue(to);
        return;
      }
      live.current.busy = true;
      Animated.spring(pan, {
        toValue: to,
        ...settleSpring(Math.hypot(to.x - from.x, to.y - from.y)),
        useNativeDriver: true,
      }).start(() => {
        live.current.busy = false;
      });
    },
    [pan],
  );

  const responder = useRef(
    PanResponder.create({
      /**
       * The touch-down point, taken in the capture phase so it is seen even
       * when the `Pressable` below claims the start. `gestureState.dx` is
       * measured from the *grant*, and a drag is granted on its first move —
       * so a drag made of one move event (a flick, a scripted pointer) would
       * measure zero and the button would not move. Every position below is
       * the finger's page point minus this one.
       */
      onStartShouldSetPanResponderCapture: (evt) => {
        live.current.down = { x: evt.nativeEvent.pageX, y: evt.nativeEvent.pageY };
        return false;
      },
      onMoveShouldSetPanResponder: (_, g) =>
        Math.abs(g.dx) > DRAG_SLOP || Math.abs(g.dy) > DRAG_SLOP,
      onPanResponderGrant: () => {
        const { shown: at } = live.current;
        if (at === null) return;
        live.current.start = { x: at.x, y: at.y };
        setDragging(true);
      },
      onPanResponderMove: (evt) => {
        const { bounds: b, insets: i } = live.current;
        if (b === null) return;
        const r = dragRange(b, i);
        const to = dragged(live.current, evt.nativeEvent);
        pan.setValue({
          x: Math.min(Math.max(to.x, r.minX), r.maxX),
          y: Math.min(Math.max(to.y, r.minY), r.maxY),
        });
      },
      onPanResponderRelease: (evt) => {
        const { shown: at, bounds: b, insets: i } = live.current;
        setDragging(false);
        if (at === null || b === null) return;
        const to = dragged(live.current, evt.nativeEvent);
        const next = releaseAt(at, to.x, to.y, b, i);
        if (next.dock === null) {
          live.current.onPositionChange(next);
          settle(to, next);
          return;
        }
        // Slide down into the edge, then become the tab.
        const frame = dockFrame(next.dock, b, i);
        travel(
          {
            x: frame.x + floating.tab.width / 2 - floating.size / 2,
            y: frame.y + floating.tab.height - floating.size / 2,
          },
          () => live.current.onPositionChange(next),
        );
      },
      onPanResponderTerminate: () => {
        const { start } = live.current;
        setDragging(false);
        pan.setValue(start);
      },
    }),
  ).current;

  const handleReturn = useCallback(() => {
    const { shown: at, bounds: b, insets: i } = live.current;
    if (at === null || at.dock === null || b === null) return;
    const frame = dockFrame(at.dock, b, i);
    pan.setValue({
      x: frame.x + floating.tab.width / 2 - floating.size / 2,
      y: frame.y + floating.tab.height - floating.size / 2,
    });
    const next = { x: at.x, y: at.y, dock: null };
    live.current.onPositionChange(next);
    travel({ x: at.x, y: at.y }, noop);
  }, [pan, travel]);

  return (
    <View style={styles.layer} onLayout={onLayout}>
      {shown === null ? null : shown.dock !== null ? (
        <DockTab
          frame={dockFrame(shown.dock, bounds ?? { width: 0, height: 0 }, insets)}
          onPress={handleReturn}
          label={t("shell.showAdd")}
        />
      ) : (
        <Animated.View
          style={[styles.wrapper, { transform: pan.getTranslateTransform() }]}
          {...responder.panHandlers}
        >
          <AddButton label={t("shell.add")} onPress={onAdd} disabled={disabled} lifted={dragging} />
        </Animated.View>
      )}
    </View>
  );
}

function noop() {}

/** Where the button's corner is for a finger at `page`, given where both began. */
function dragged(
  from: { start: { x: number; y: number }; down: { x: number; y: number } },
  page: { pageX: number; pageY: number },
): { x: number; y: number } {
  return { x: from.start.x + page.pageX - from.down.x, y: from.start.y + page.pageY - from.down.y };
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
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      onPress={onPress}
      hitSlop={TAB_SLOP}
      {...handlers}
      style={[styles.tab, { left: frame.x, top: frame.y }, focused ? styles.focused : null]}
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
  layer: { position: "absolute", top: 0, right: 0, bottom: 0, left: 0, pointerEvents: "box-none" },
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
}));
