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
 *
 * **And on a narrow screen the action goes under the message, not beside
 * it.** A button holds its own width whatever the row does, so at 390pt it
 * takes about a third of the line and leaves the message a column two words
 * wide: *"No rate for EUR — add one before capturing"* wrapped to four lines
 * and the banner stood 110pt tall, over a screen it was only meant to
 * annotate. Stacked, the message gets the whole width, wraps to two lines,
 * and the action sits under it on the left where the text starts. The
 * threshold is the banner's **own** measured width, not the window's: a
 * banner in a narrow column at desk width has the same problem, and a
 * breakpoint would not see it.
 */

import { useCallback, useState } from "react";
import type { LayoutChangeEvent } from "react-native";
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

/**
 * Below this, an action beside the message leaves it too little width to
 * read as a sentence. 480 rather than a device breakpoint (`02-tokens`
 * §2.10's 1024): this is a question about *this component's* own line
 * length, and the same banner is just as cramped in a 380pt column on a
 * 1440pt screen.
 */
const STACK_BELOW = 480;

/**
 * Whether the action goes under the message rather than beside it.
 *
 * A width of `0` is "not measured yet", not "infinitely narrow" — the first
 * frame lays out as a row, which is the shape that degrades gracefully if a
 * measurement never arrives at all. With no action there is nothing to stack.
 */
export function bannerStacks(width: number, hasAction: boolean): boolean {
  return hasAction && width > 0 && width < STACK_BELOW;
}

export function Banner({ tone, message, action }: BannerProps) {
  const t = useTheme();
  const styles = useStyles();
  const [width, setWidth] = useState(0);

  const onLayout = useCallback((event: LayoutChangeEvent) => {
    setWidth(event.nativeEvent.layout.width);
  }, []);

  // Computed rather than in `useStyles`: the colour is per-`tone`, a prop —
  // `tag.tsx`'s own `fill`/`ink` are the same shape, built beside the JSX.
  const fill = { backgroundColor: t[FILL[tone]], borderColor: t[BORDER[tone]] };
  const ink = { color: t[INK[tone]] };
  const stacked = bannerStacks(width, action !== undefined);

  return (
    <View
      accessibilityRole="alert"
      onLayout={onLayout}
      style={[styles.root, stacked ? styles.stacked : styles.row, fill]}
    >
      <Text style={[styles.message, ink, stacked ? styles.messageStacked : null]}>{message}</Text>
      {action ? <Button {...action} variant="secondary" size="sm" /> : null}
    </View>
  );
}

const useStyles = makeStyles(() => ({
  root: {
    gap: space.x3,
    borderRadius: radius.md,
    borderWidth: 1,
    padding: space.x3,
  },
  row: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  /** `flex-start`, so the button keeps its content width and starts where the text does. */
  stacked: { flexDirection: "column", alignItems: "flex-start" },
  message: { ...text.ui("body"), flexShrink: 1 },
  /** The whole width, once nothing is beside it. */
  messageStacked: { alignSelf: "stretch" },
}));
