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
 * **The dots are text, not a set of components.** `thinking` and `tool` both
 * get them, beside the label — `streaming` does not, because text arriving is
 * its own sign of life and a stepping dot beside moving text would be two
 * signals for one fact. One dot, two dots, three dots, drop: the count steps
 * `.` → `..` → `...` → `` (empty) on a fixed 250 ms beat and repeats, a plain
 * `setInterval` advancing a string, not an animated value — there is nothing
 * here for Reanimated to own.
 *
 * **The row must not shift as the count changes.** `phaseRow` shrink-wraps
 * its content, so a `Text` that is two characters wide one moment and three
 * the next resizes the row itself, not just the glyph — a visible jitter with
 * nothing after it to blame it on. So the dots sit in their own box, sized
 * once by an invisible `...` — the widest step — laid out normally to claim
 * the width, with the real, stepping text overlaid on top of it via
 * `position: "absolute"`. The box's width never changes; only what is
 * painted inside it does.
 *
 * Reduced motion freezes on the full three dots — `DOT_STEPS`'s own widest
 * step, the same string the sizer already measures, rather than a second
 * glyph invented for the occasion — and starts no interval at all, the same
 * house rule `useReducedMotion` documents: the reduced branch shows a state
 * the animated path can also reach, not a different one.
 *
 * **`elapsedMs` is a prop, not a clock this component owns**, so a test can
 * assert the 20 s cancel affordance without waiting 20 real seconds — the
 * caller (which is already ticking a turn's elapsed time for the 2 s timer
 * anyway) is the one honest owner of "how long has this been running".
 */

import { useEffect, useState } from "react";
import { Text, View } from "react-native";
import { useT } from "../i18n/provider";
import { Button } from "../primitives/button";
import { useReducedMotion } from "../primitives/reduced-motion.ts";
import { text } from "../theme/fonts.ts";
import { makeStyles } from "../theme/styles.ts";
import { space } from "../tokens.ts";

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

/** One step of the beat. Widest last, which is also what sizes the box below. */
const DOT_STEPS = [".", "..", "...", ""] as const;
/** The beat itself — a 1 s cycle across the four steps above. */
const STEP_MS = 250;
/** The step reduced motion freezes on — the same full-width string the sizer measures. */
const FULL_STEP = DOT_STEPS[2];

/**
 * Steps `DOT_STEPS` on a plain interval — no Reanimated involved, because
 * nothing here is a continuous value, only a string that changes four times a
 * second. Starts at index 0 (`.`) so the first paint already shows a dot
 * rather than a beat of nothing.
 *
 * The interval is cleared on unmount, and `ThinkingDots` is only ever mounted
 * for `thinking`/`tool` — so a caller moving to `streaming` unmounts it and
 * clears the interval by the same mechanism, not a second one.
 */
function useThinkingDots(reduced: boolean): string {
  const [step, setStep] = useState(0);

  useEffect(() => {
    if (reduced) return; // The `motion-none` branch (§2.7) — no interval to clear because none starts.
    const id = setInterval(() => {
      setStep((current) => (current + 1) % DOT_STEPS.length);
    }, STEP_MS);
    return () => clearInterval(id);
  }, [reduced]);

  return reduced ? FULL_STEP : (DOT_STEPS[step] ?? DOT_STEPS[0]);
}

function ThinkingDots({ reduced }: { reduced: boolean }) {
  const styles = useStyles();
  const dots = useThinkingDots(reduced);
  return (
    // Decorative: the row's own "accessibilityLabel" already says "thinking".
    <View accessibilityElementsHidden importantForAccessibility="no">
      {/* Invisible, laid out normally: claims the row's width at its widest step
      so the real text below can move inside that width without ever changing it. */}
      <Text style={[styles.dotText, styles.dotsSizer]}>{FULL_STEP}</Text>
      <Text style={[styles.dotText, styles.dotsVisible]} testID="thinking-dots">
        {dots}
      </Text>
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

const useStyles = makeStyles((theme) => ({
  label: { color: theme.textMuted, ...text.ui("bodySm") },
  mono: { color: theme.textMuted, ...text.mono("bodySm") },
  phaseRow: { flexDirection: "row", alignItems: "center", gap: space.sm },
  dotText: { color: theme.textMuted, ...text.ui("bodySm") },
  dotsSizer: { opacity: 0 },
  dotsVisible: { position: "absolute", top: 0, left: 0 },
  stillWorking: { flexDirection: "row", alignItems: "center", gap: space.x3, marginTop: space.xl },
}));
