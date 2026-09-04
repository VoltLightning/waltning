/**
 * `<ThinkingIndicator>` — `design-system/08` §8.5. Agent turns run 3–15 s and
 * receipt extraction 2–5 s: **a blank canvas for fifteen seconds is
 * indistinguishable from a hang.**
 *
 * Three phases, and it shows which one it is in: `thinking` (no output yet,
 * an elapsed timer after 2 s), `tool` (names the tool — `search_transactions ·
 * 1.2 s`, pre-formatted by the caller, who knows the exact tool and its own
 * timing) and `streaming` (the text as it arrives, handed straight through).
 *
 * **The three dots — a messaging-app typing indicator, not a fade pulse.**
 * `thinking` and `tool` both get them, beside the label — `streaming` does
 * not, because text arriving is its own sign of life and a bouncing dot
 * beside moving text would be two signals for one fact.
 *
 * The first cut had each dot own its own `withRepeat(withSequence(…))` chain
 * — three independent timers, all cutting to zero together every 900 ms and
 * restarting: jagged on the web (Reanimated's JS driver), and the owner's own
 * read of it was *"circulates three two one two one two three"*. This is
 * **one shared clock** — a single `withRepeat(withTiming(1, { duration: 900,
 * easing: Easing.linear }), -1)` — and each dot derives its own opacity and
 * lift from it in its own `useAnimatedStyle`, so nothing restarts and no two
 * dots ever move in the same direction at the same instant.
 *
 * **The motion, named: each dot lifts and settles**, `translateY` 0 → −3 →
 * 0 with opacity 0.45 → 1 → 0.45, `Easing.inOut(Easing.quad)`-shaped — the
 * classic Messenger/iMessage wave. Dot *i* sits at phase `i / 3` of the
 * cycle — equal thirds, a true circular 1 → 2 → 3 with no dot favoured — so
 * the wave always reads left to right, never backwards. Each dot's own
 * rise-and-fall window (half-width 0.4) is wider than the third-of-a-cycle
 * spacing between dots, so adjacent dots' windows overlap all the way around
 * the loop and at no instant are all three at rest together: the row never
 * goes flat, and nothing cuts.
 *
 * `envelope` is the shared shape, plain arithmetic with no Reanimated
 * `interpolate` in it (that call is a no-op in this package's test
 * environment, so a function the tests must exercise for real cannot depend
 * on it): a dot's own window is a triangle centred on `phase`, ±`HALF_WIDTH`,
 * mapped through `Easing.inOut(Easing.quad)`. It is evaluated at `t`, `t − 1`
 * and `t + 1` and the max taken, so a window that straddles the 0/1 loop
 * point (dot 1's own) reads continuously across it rather than jumping. §2.7
 * permits a loop only for *loading*, which this is; every other animation in
 * the package plays once. The dots are `radius.pill` — the fourth circular
 * exception `02-tokens.md` §2.4 now names, beside the radio, the switch and
 * the add button — and they are decorative: the row's own
 * `accessibilityLabel` already says *thinking*, so a screen reader is never
 * asked to parse three unlabelled dots.
 *
 * **`elapsedMs` is a prop, not a clock this component owns**, so a test can
 * assert the 20 s cancel affordance without waiting 20 real seconds — the
 * caller (which is already ticking a turn's elapsed time for the 2 s timer
 * anyway) is the one honest owner of "how long has this been running".
 */

import { useEffect } from "react";
import { Text, View } from "react-native";
import Animated, {
  Easing,
  interpolate,
  type SharedValue,
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withTiming,
} from "react-native-reanimated";
import { useT } from "../i18n/provider";
import { Button } from "../primitives/button";
import { useReducedMotion } from "../primitives/reduced-motion.ts";
import { text } from "../theme/fonts.ts";
import { makeStyles } from "../theme/styles.ts";
import { radius, space } from "../tokens.ts";

export type ThinkingPhase = "thinking" | "tool" | "streaming";

export type ThinkingIndicatorProps = {
  phase: ThinkingPhase;
  /** Milliseconds since the turn began. Drives the 2 s timer and the 20 s cancel. */
  elapsedMs: number;
  /** `phase: "tool"` — pre-formatted, e.g. `"search_transactions · 1.2 s"`. */
  toolLabel?: string;
  /** `phase: "streaming"` — the text that has arrived so far. */
  streamingText?: string;
  onCancel: () => void;
};

const TIMER_AFTER_MS = 2_000;
const CANCEL_AFTER_MS = 20_000;

/** The clock's own cycle. Runs 0→1 on a single `withRepeat`, shared by all three dots. */
const CYCLE = 900;
/** How far a lifted dot rises. Reserved as `marginTop` on the row so it never reflows the label. */
const LIFT = 3;
/** A resting dot's opacity — never fully dark, so the row always reads as three dots, not a gap. */
const MIN_OPACITY = 0.45;
/**
 * Dot *i*'s phase within the cycle, equal thirds apart — 0, 1/3, 2/3 — a true
 * circular 1 → 2 → 3 with no dot favoured over another.
 */
const DOT_PHASES = [0, 1 / 3, 2 / 3] as const;
/**
 * Half the width of one dot's own rise-and-fall window — wider than the
 * third-of-a-cycle stagger between dots, so consecutive dots' windows
 * overlap all the way around the loop and the row is never simultaneously
 * at rest.
 */
const HALF_WIDTH = 0.4;

const liftEasing = Easing.inOut(Easing.quad);

/**
 * A linear triangle centred on `phase`: 1 at `phase`, falling to 0 at
 * `phase ± HALF_WIDTH`, 0 beyond it. Plain arithmetic, deliberately not
 * Reanimated's `interpolate` — that call is a no-op in this package's test
 * stand-in, so a shape the tests must exercise for real cannot be built from
 * it.
 */
function triangle(t: number, phase: number): number {
  "worklet";
  const distance = Math.abs(t - phase) / HALF_WIDTH;
  return distance >= 1 ? 0 : 1 - distance;
}

/**
 * Dot at `phase`'s lift-and-settle envelope at clock position `t` (0..1) —
 * 0 at rest, 1 at the peak of its own rise, `Easing.inOut(Easing.quad)`-shaped
 * rather than a linear tent.
 *
 * `triangle` is evaluated at `t`, `t − 1` and `t + 1` and the max taken,
 * which is what lets a window straddle the loop's 0/1 seam — dot 1's own,
 * whose window runs from before 0 to after it — without a discontinuity.
 */
export function envelope(t: number, phase: number): number {
  "worklet";
  const raw = Math.max(triangle(t, phase), triangle(t - 1, phase), triangle(t + 1, phase));
  return liftEasing(raw);
}

/**
 * The one shared clock — a single `withRepeat`'d `withTiming`, read by all
 * three dots. `useEffect`, not a worklet: exactly how `Toggle`'s
 * `progress.value = withTiming(…)` assigns an animation builder's result to
 * a shared value from the JS thread.
 */
function useDotClock(reduced: boolean): SharedValue<number> {
  const clock = useSharedValue(0);

  useEffect(() => {
    if (reduced) return; // The `motion-none` branch (§2.7) — a loop nobody asked to keep running.
    clock.value = withRepeat(withTiming(1, { duration: CYCLE, easing: Easing.linear }), -1, false);
  }, [reduced, clock]);

  return clock;
}

type DotProps = { clock: SharedValue<number>; reduced: boolean; phase: number };

/**
 * Reads `clock` and `reduced` only inside the worklet — no React state is
 * touched by the animation, so this component never re-renders per frame.
 */
function Dot({ clock, reduced, phase }: DotProps) {
  const styles = useStyles();
  const style = useAnimatedStyle(() => {
    if (reduced) return { opacity: 1, transform: [{ translateY: 0 }] };
    const lift = envelope(clock.value, phase);
    return {
      opacity: interpolate(lift, [0, 1], [MIN_OPACITY, 1]),
      transform: [{ translateY: interpolate(lift, [0, 1], [0, -LIFT]) }],
    };
  }, [clock, reduced, phase]);
  return <Animated.View testID="thinking-dot" style={[styles.dot, style]} />;
}

function ThinkingDots({ reduced }: { reduced: boolean }) {
  const styles = useStyles();
  const clock = useDotClock(reduced);
  return (
    // Decorative: the row's own "accessibilityLabel" already says "thinking".
    <View style={styles.dots} accessibilityElementsHidden importantForAccessibility="no">
      {DOT_PHASES.map((phase) => (
        <Dot key={phase} clock={clock} reduced={reduced} phase={phase} />
      ))}
    </View>
  );
}

export function ThinkingIndicator({
  phase,
  elapsedMs,
  toolLabel,
  streamingText,
  onCancel,
}: ThinkingIndicatorProps) {
  const t = useT();
  const styles = useStyles();
  const reduced = useReducedMotion();
  const seconds = Math.floor(elapsedMs / 1000);

  return (
    <View>
      <View accessibilityRole="progressbar" accessibilityLabel={t("states.thinking.thinking")}>
        {phase === "thinking" ? (
          <View style={styles.phaseRow}>
            <Text style={styles.label}>
              {t("states.thinking.thinking")}
              {elapsedMs >= TIMER_AFTER_MS ? ` · ${seconds}s` : ""}
            </Text>
            <ThinkingDots reduced={reduced} />
          </View>
        ) : phase === "tool" ? (
          <View style={styles.phaseRow}>
            <Text style={styles.mono}>{toolLabel}</Text>
            <ThinkingDots reduced={reduced} />
          </View>
        ) : (
          <Text style={styles.label}>{streamingText}</Text>
        )}
      </View>
      {elapsedMs >= CANCEL_AFTER_MS ? (
        <View style={styles.stillWorking}>
          <Text style={styles.label}>{t("states.thinking.stillWorking")}</Text>
          <Button label={t("common.cancel")} onPress={onCancel} variant="secondary" size="sm" />
        </View>
      ) : null}
    </View>
  );
}

const DOT = 4;

const useStyles = makeStyles((theme) => ({
  label: { color: theme.textMuted, ...text.ui("bodySm") },
  mono: { color: theme.textMuted, ...text.mono("bodySm") },
  phaseRow: { flexDirection: "row", alignItems: "center", gap: space.sm },
  // `marginTop: LIFT` reserves the room a lifted dot rises into — a
  // `translateY` never reflows layout on its own, but the row's own bounds
  // would otherwise sit flush against the dots' resting position.
  dots: { flexDirection: "row", alignItems: "center", gap: space.xxs, marginTop: LIFT },
  // Circles are legal here — §2.4's fourth exception, beside the radio, the
  // switch and the add button.
  dot: { width: DOT, height: DOT, borderRadius: radius.pill, backgroundColor: theme.textMuted },
  stillWorking: { flexDirection: "row", alignItems: "center", gap: space.x3, marginTop: space.xl },
}));
