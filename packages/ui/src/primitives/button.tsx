/**
 * `<Button>` — `design-system/03` §3.1.
 *
 * Four variants, and the asymmetry between them **is** the affordance: §3.1's
 * rule is *never two `primary` buttons in one decision*. Import review's
 * Accept/Skip and the diff card's Approve/Decline are both primary + secondary,
 * so the eye finds the affirmative action without reading either label. Two
 * primaries makes the reader choose twice — once about which button, once about
 * which decision.
 *
 * That rule is not enforceable by a button on its own; it is a property of the
 * pair. `<ButtonRow>` in the organisms layer takes `primary` and `secondary` as
 * separate props, which makes two primaries unrepresentable rather than
 * discouraged.
 *
 * **Loading holds the width.** A spinner that shrinks the button moves whatever
 * is beside it, and the most common thing beside an affirmative button is the
 * destructive one.
 */

import { useState } from "react";
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from "react-native";
import { color, focus, radius, space, touchTarget, type } from "../tokens.ts";

export type ButtonVariant = "primary" | "secondary" | "ghost" | "danger";
export type ButtonSize = "sm" | "md" | "lg";

export type ButtonProps = {
  label: string;
  onPress: () => void;
  variant?: ButtonVariant;
  size?: ButtonSize;
  disabled?: boolean;
  /** Spinner replaces the label; the width does not change. */
  loading?: boolean;
};

/** §3.1: sm 32 · md 40 · lg 48. */
const HEIGHT: Record<ButtonSize, number> = { sm: 32, md: 40, lg: 48 };

export function Button({
  label,
  onPress,
  variant = "secondary",
  size = "md",
  disabled = false,
  loading = false,
}: ButtonProps) {
  const inactive = disabled || loading;

  /**
   * Tracked here rather than read from Pressable's state callback, which only
   * reports `pressed` in React Native core — `focused` exists on web alone. A
   * ring that appears on one surface and not the other is worse than none: it
   * looks handled.
   */
  const [focused, setFocused] = useState(false);

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ disabled: inactive, busy: loading }}
      disabled={inactive}
      onPress={onPress}
      onFocus={() => setFocused(true)}
      onBlur={() => setFocused(false)}
      style={({ pressed }) => [
        styles.base,
        { height: HEIGHT[size] },
        VARIANT[variant],
        pressed ? styles.pressed : null,
        // §2.6: on **every** interactive element, never removed and never
        // replaced by a colour change alone — a colour-only focus state is
        // invisible to exactly the people it exists for.
        focused ? styles.focused : null,
        inactive ? styles.inactive : null,
      ]}
    >
      {/*
        Both are always mounted; only visibility changes. Swapping the label out
        for a spinner re-measures the button, and the thing beside an
        affirmative action is usually the destructive one.
      */}
      <Text style={[styles.label, INK[variant], loading ? styles.hidden : null]}>{label}</Text>
      {loading ? (
        <View style={styles.spinner}>
          <ActivityIndicator size="small" color={INK[variant].color} />
        </View>
      ) : null}
    </Pressable>
  );
}

const VARIANT = StyleSheet.create({
  primary: { backgroundColor: color.green600 },
  secondary: { borderWidth: 1, borderColor: color.green200 },
  ghost: {},
  danger: { borderWidth: 1, borderColor: color.negative },
});

const INK = StyleSheet.create({
  primary: { color: color.surface },
  secondary: { color: color.green700 },
  ghost: { color: color.muted },
  danger: { color: color.negative },
});

const styles = StyleSheet.create({
  base: {
    minHeight: touchTarget.min,
    justifyContent: "center",
    alignItems: "center",
    paddingHorizontal: space.x3,
    borderRadius: radius.sm,
  },
  label: { fontSize: type.body.fontSize, fontWeight: "600" },
  hidden: { opacity: 0 },
  spinner: {
    position: "absolute",
    top: 0,
    right: 0,
    bottom: 0,
    left: 0,
    justifyContent: "center",
    alignItems: "center",
  },
  pressed: { opacity: 0.85 },
  focused: { outlineWidth: focus.width, outlineColor: focus.color, outlineOffset: focus.offset },
  inactive: { opacity: 0.45 },
});
