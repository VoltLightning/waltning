/**
 * `<Tag>` — `design-system/03` §3.3. Static, non-interactive.
 *
 * **Filed here, and the `biz` variant is why it was briefly not.** §3.3 gives
 * `Tag` a variant that marks a business row, which reads like transactions
 * knowledge — so it moved to `transactions/`, and `FxAmount` immediately had to
 * reach across a domain boundary to render its amber marker.
 *
 * The second consumer settled it: `Tag` is a *shape* — a pill-shaped label with
 * four inks — and `biz` is one caller's use of it. A variant naming a domain
 * does not make the component belong to that domain, or `Button` would live
 * wherever its first `Approve` was written.
 *
 * **Text is always present; never tint alone (P5).** A colour-only marker is
 * invisible to anyone who cannot distinguish the two colours, and amber carries
 * four different meanings in this system — all of them "asserted or aged rather
 * than observed" (P4), told apart only by what the tag says.
 */

import { Text, View } from "react-native";
import { text } from "../theme/fonts.ts";
import { useTheme } from "../theme/provider";
import { makeStyles } from "../theme/styles.ts";
import { radius, space } from "../tokens.ts";

export type TagVariant = "neutral" | "warn" | "negative" | "biz";

export type TagProps = {
  variant?: TagVariant;
  children: string;
};

/**
 * `biz` and `neutral` resolve to the same pair today and are still two entries.
 * A business marker and a plain category label are different claims about a
 * row, and the day one of them moves is the day a merge here would have to be
 * unpicked across every caller.
 */
const FILL = {
  neutral: "tagNeutralFill",
  warn: "assertedFill",
  negative: "dangerFill",
  biz: "tagNeutralFill",
} as const satisfies Record<TagVariant, string>;

const INK = {
  neutral: "tagNeutralText",
  warn: "assertedText",
  negative: "dangerText",
  biz: "tagNeutralText",
} as const satisfies Record<TagVariant, string>;

export function Tag({ variant = "neutral", children }: TagProps) {
  const t = useTheme();
  const styles = useStyles();

  // Computed rather than in `useStyles`: the colour is per-`variant`, a prop,
  // not a theme-scale constant — `dock.tsx`'s own `clearance` is the same
  // shape, a plain object built beside the JSX rather than inline inside it.
  const fill = { backgroundColor: t[FILL[variant]] };
  const ink = { color: t[INK[variant]] };

  return (
    <View style={[styles.tag, fill]}>
      {/*
        Casing is `textTransform` alone, never `.toUpperCase()` in JavaScript.
        Two mechanisms doing one job is one that eventually disagrees — and the
        CSS form is also the accessible one: a screen reader announces the
        original text rather than spelling out capitals.
      */}
      <Text style={[styles.text, ink]}>{children}</Text>
    </View>
  );
}

const useStyles = makeStyles(() => ({
  tag: {
    borderRadius: radius.sm,
    paddingHorizontal: space.lg,
    paddingVertical: space.xs,
    alignSelf: "flex-start",
  },
  text: {
    ...text.ui("tag"),
    textTransform: "uppercase",
  },
}));
