/**
 * `<Banner>` — `design-system/05` §5.4. Page-level, one tone, one action.
 *
 * `warn` = not finished or not fully observed — **P4's amber**, and the only
 * component here that may use it, per `design-system/02`'s rule that amber
 * means exactly one thing system-wide. `negative` = a failure. `neutral` =
 * offline, stated as freshness (§8.3: *"Showing data as of 14:06" beats
 * "Offline"* — one tells you what you are looking at, the other what you
 * cannot do).
 *
 * **One action, never a row of them.** A banner with three affordances is
 * asking to be read like a form; the message is the point.
 */

import { Text, View } from "react-native";
import { Button } from "../primitives/button";
import { text } from "../theme/fonts.ts";
import { useTheme } from "../theme/provider";
import { makeStyles } from "../theme/styles.ts";
import { radius, space } from "../tokens.ts";

export type BannerTone = "warn" | "negative" | "neutral";

export type BannerProps = {
  tone: BannerTone;
  message: string;
  action?: { label: string; onPress: () => void };
};

const FILL = {
  warn: "assertedFill",
  negative: "dangerFill",
  neutral: "subtleFill",
} as const satisfies Record<BannerTone, string>;

const BORDER = {
  warn: "assertedBorder",
  negative: "dangerBorder",
  neutral: "border",
} as const satisfies Record<BannerTone, string>;

const INK = {
  warn: "assertedText",
  negative: "dangerText",
  neutral: "textMuted",
} as const satisfies Record<BannerTone, string>;

export function Banner({ tone, message, action }: BannerProps) {
  const t = useTheme();
  const styles = useStyles();

  // Computed rather than in `useStyles`: the colour is per-`tone`, a prop —
  // `tag.tsx`'s own `fill`/`ink` are the same shape, built beside the JSX.
  const fill = { backgroundColor: t[FILL[tone]], borderColor: t[BORDER[tone]] };
  const ink = { color: t[INK[tone]] };

  return (
    <View accessibilityRole="alert" style={[styles.root, fill]}>
      <Text style={[styles.message, ink]}>{message}</Text>
      {action ? <Button {...action} variant="secondary" size="sm" /> : null}
    </View>
  );
}

const useStyles = makeStyles(() => ({
  root: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: space.x3,
    borderRadius: radius.md,
    borderWidth: 1,
    padding: space.x3,
  },
  message: { ...text.ui("body"), flexShrink: 1 },
}));
