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
 * **The three dots — the owner's own request: *"dots that appear and
 * disappear"*.** `thinking` and `tool` both get them, beside the label —
 * `streaming` does not, because text arriving is its own sign of life and a
 * pulsing dot beside moving text would be two signals for one fact. One
 * 1.2 s cycle: dot 1 fades in at 0 ms, dot 2 at 200, dot 3 at 400, all three
 * fade out together from 900 to the 1200 ms loop point — `withRepeat` around
 * a `withSequence` of `withDelay` and `withTiming`, one shared value per dot.
 * §2.7 permits a loop only for *loading*, which this is; every other
 * animation in the package plays once. The dots are `radius.pill` — the
 * fourth circular exception `02-tokens.md` §2.4 now names, beside the radio,
 * the switch and the add button — and they are decorative: the row's own
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
  type SharedValue,
  useAnimatedStyle,
  useSharedValue,
  withDelay,
  withRepeat,
  withSequence,
  withTiming,
} from "react-native-reanimated";
import { useT } from "../i18n/provider";
import { Button } from "../primitives/button";
import { easing } from "../primitives/easing.ts";
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

/** One dot's appear time within the cycle — §8.5's 0 / 200 / 400 ms. */
const DOT_DELAYS = [0, 200, 400] as const;
const FADE_IN = 150;
/** All three dots fade out together from 900 ms, finishing at the 1200 ms loop point. */
const FADE_OUT_AT = 900;
const CYCLE = 1_200;

/**
 * One dot's opacity across the 1.2 s cycle, as a `withRepeat`'d
 * `withSequence` — delay to its appear time, fade in, hold, fade out with its
 * siblings, then loop. Called from `useEffect`, not a worklet: exactly how
 * `Toggle`'s `progress.value = withTiming(…)` assigns an animation builder's
 * result to a shared value from the JS thread.
 */
function loopingOpacity(delayMs: number): number {
  const holdMs = FADE_OUT_AT - delayMs - FADE_IN;
  return withRepeat(
    withSequence(
      withDelay(delayMs, withTiming(1, { duration: FADE_IN, easing: easing.base })),
      withTiming(1, { duration: holdMs }),
      withTiming(0, { duration: CYCLE - FADE_OUT_AT, easing: easing.base }),
    ),
    -1,
    false,
  );
}

function useDotOpacity(reduced: boolean, delayMs: number): SharedValue<number> {
  const opacity = useSharedValue(reduced ? 1 : 0);

  useEffect(() => {
    if (reduced) {
      // The `motion-none` branch (§2.7): static, all three visible, rather
      // than a loop nobody asked to keep running.
      opacity.value = 1;
      return;
    }
    opacity.value = loopingOpacity(delayMs);
  }, [reduced, delayMs, opacity]);

  return opacity;
}

type DotProps = { reduced: boolean; delayMs: number };

function Dot({ reduced, delayMs }: DotProps) {
  const styles = useStyles();
  const opacity = useDotOpacity(reduced, delayMs);
  const style = useAnimatedStyle(() => ({ opacity: opacity.value }), [opacity]);
  return <Animated.View testID="thinking-dot" style={[styles.dot, style]} />;
}

function ThinkingDots({ reduced }: { reduced: boolean }) {
  const styles = useStyles();
  return (
    // Decorative: the row's own `accessibilityLabel` already says "thinking".
    <View style={styles.dots} accessibilityElementsHidden importantForAccessibility="no">
      {DOT_DELAYS.map((delayMs) => (
        <Dot key={delayMs} reduced={reduced} delayMs={delayMs} />
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
  dots: { flexDirection: "row", alignItems: "center", gap: space.xxs },
  // Circles are legal here — §2.4's fourth exception, beside the radio, the
  // switch and the add button.
  dot: { width: DOT, height: DOT, borderRadius: radius.pill, backgroundColor: theme.textMuted },
  stillWorking: { flexDirection: "row", alignItems: "center", gap: space.x3, marginTop: space.xl },
}));
