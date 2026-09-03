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
 * **`elapsedMs` is a prop, not a clock this component owns**, so a test can
 * assert the 20 s cancel affordance without waiting 20 real seconds — the
 * caller (which is already ticking a turn's elapsed time for the 2 s timer
 * anyway) is the one honest owner of "how long has this been running".
 */

import { Text, View } from "react-native";
import { useT } from "../i18n/provider";
import { Button } from "../primitives/button";
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

export function ThinkingIndicator({
  phase,
  elapsedMs,
  toolLabel,
  streamingText,
  onCancel,
}: ThinkingIndicatorProps) {
  const t = useT();
  const styles = useStyles();
  const seconds = Math.floor(elapsedMs / 1000);

  return (
    <View>
      <View accessibilityRole="progressbar" accessibilityLabel={t("states.thinking.thinking")}>
        {phase === "thinking" ? (
          <Text style={styles.label}>
            {t("states.thinking.thinking")}
            {elapsedMs >= TIMER_AFTER_MS ? ` · ${seconds}s` : ""}
          </Text>
        ) : phase === "tool" ? (
          <Text style={styles.mono}>{toolLabel}</Text>
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
  stillWorking: { flexDirection: "row", alignItems: "center", gap: space.x3, marginTop: space.xl },
}));
