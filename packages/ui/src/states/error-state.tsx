/**
 * `<ErrorState>` — `design-system/08` §8.2.
 *
 * Carries four things, always: **what failed · why · what it costs you · what
 * to do next.** Never a bare code, and never an apology in place of an action
 * — `action` is optional in the type only because a `terminal` failure with
 * nothing left to retry is real (the input stays on screen for inspection);
 * every call site that *can* offer a next step must.
 *
 * | Variant | Use | Retains |
 * |---|---|---|
 * | `recoverable` | Retry is likely to work — network, timeout, provider | The attempt, so retry costs nothing |
 * | `terminal` | Retry will not help — malformed file, dead source | The input, for inspection or export |
 * | `partial` | Some of it worked | The successful part, explicitly counted |
 *
 * The variant is stated on screen through a `Tag` rather than colour alone
 * (P5): a colour-only marker is invisible to anyone who cannot distinguish
 * the two colours, and `recoverable`/`terminal`/`partial` are three different
 * claims about what happened, not three moods.
 */

import { Text, View } from "react-native";
import { useT } from "../i18n/provider";
import { Button } from "../primitives/button";
import { Tag, type TagVariant } from "../primitives/tag";
import { text } from "../theme/fonts.ts";
import { makeStyles } from "../theme/styles.ts";
import { space } from "../tokens.ts";

export type ErrorStateVariant = "recoverable" | "terminal" | "partial";

export type ErrorStateProps = {
  variant: ErrorStateVariant;
  /** What failed — the heading. */
  what: string;
  /** Why it failed, in words a reader can act on. Never a bare code. */
  why: string;
  /** What it cost you — a partial's counted success, a terminal's retained input. */
  cost?: string;
  action?: { label: string; onPress: () => void };
};

const TAG_VARIANT: Record<ErrorStateVariant, TagVariant> = {
  recoverable: "neutral",
  terminal: "negative",
  partial: "warn",
};

const BADGE_KEY = {
  recoverable: "states.error.recoverable",
  terminal: "states.error.terminal",
  partial: "states.error.partial",
} as const;

export function ErrorState({ variant, what, why, cost, action }: ErrorStateProps) {
  const t = useT();
  const styles = useStyles();
  return (
    <View style={styles.root}>
      <Tag variant={TAG_VARIANT[variant]}>{t(BADGE_KEY[variant])}</Tag>
      <Text style={styles.what}>{what}</Text>
      <Text style={styles.why}>{why}</Text>
      {cost ? <Text style={styles.cost}>{cost}</Text> : null}
      {action ? (
        <View style={styles.actions}>
          <Button {...action} variant="primary" size="lg" />
        </View>
      ) : null}
    </View>
  );
}

const useStyles = makeStyles((theme) => ({
  root: { alignItems: "center", gap: space.x3, padding: space.x6 },
  what: { color: theme.text, ...text.display("displayTwo"), textAlign: "center" },
  why: { color: theme.textMuted, ...text.ui("body"), textAlign: "center" },
  cost: { color: theme.textMuted, ...text.ui("bodySm", 600), textAlign: "center" },
  actions: { width: "100%", gap: space.xl },
}));
