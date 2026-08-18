/**
 * `<Tag>` — `design-system/03` §3.3. Static, non-interactive.
 *
 * **Text is always present; never tint alone (P5).** A colour-only marker is
 * invisible to anyone who cannot distinguish the two colours, and amber carries
 * four different meanings in this system — all of them "asserted or aged rather
 * than observed" (P4), told apart only by what the tag says.
 */

import { StyleSheet, Text, View } from "react-native";
import { color, radius, space, type } from "../tokens.ts";

export type TagVariant = "neutral" | "warn" | "negative" | "biz";

export type TagProps = {
  variant?: TagVariant;
  children: string;
};

const FILL: Record<TagVariant, string> = {
  neutral: color.green100,
  warn: color.amber,
  negative: color.negativeBg,
  biz: color.green100,
};

const INK: Record<TagVariant, string> = {
  neutral: color.green700,
  warn: color.amberInk,
  negative: color.negative,
  biz: color.green700,
};

export function Tag({ variant = "neutral", children }: TagProps) {
  return (
    <View style={[styles.tag, { backgroundColor: FILL[variant] }]}>
      {/*
        Casing is `textTransform` alone, never `.toUpperCase()` in JavaScript.
        Two mechanisms doing one job is one that eventually disagrees — and the
        CSS form is also the accessible one: a screen reader announces the
        original text rather than spelling out capitals.
      */}
      <Text style={[styles.text, { color: INK[variant] }]}>{children}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  tag: {
    borderRadius: radius.pill,
    paddingHorizontal: space.md,
    paddingVertical: space.xs,
    alignSelf: "flex-start",
  },
  text: {
    fontSize: type.tag.fontSize,
    lineHeight: type.tag.lineHeight,
    fontWeight: type.tag.fontWeight,
    letterSpacing: type.tag.letterSpacing,
    textTransform: "uppercase",
  },
});
