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

import { useCallback } from "react";
import { ActivityIndicator, Pressable, Text, View } from "react-native";
import Animated from "react-native-reanimated";
import { text } from "../theme/fonts.ts";
import { makeStyles } from "../theme/styles.ts";
import { focus, radius, space, touchTarget } from "../tokens.ts";
import { useInteraction } from "./interaction.ts";
import { usePressScale } from "./press-scale.ts";

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

/**
 * §3.1: sm 32 · md 40 · lg 48 — and until now two of the three were lies.
 * The base style carried `minHeight: 44` for the §10 floor, and in Yoga a
 * minHeight beats a smaller height, so `sm` and `md` both rendered at 44 and
 * nobody had chosen that. The floor belongs to the *touch target*, not the
 * drawn box: `hitSlop` fills the difference, which is `IconButton`'s pattern
 * and now §2.4's stated rule.
 */
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

  const { hovered, focused, handlers } = useInteraction();
  const styles = useStyles();
  const ink = styles[INK_STYLE[variant]];
  const press = usePressScale();
  const slop = Math.max(0, (touchTarget.min - HEIGHT[size]) / 2);
  const pressableStyle = useCallback(
    () => [
      styles.base,
      { height: HEIGHT[size] },
      styles[VARIANT_STYLE[variant]],
      // The outlined variants take `hoverFill` under a pointer; `primary` is a
      // solid fill and gets its liveliness from the press scale alone — a
      // second green for its hover would be a new role for one state.
      hovered && !inactive && variant !== "primary" ? styles.hovered : null,
      // §2.6: on **every** interactive element, never removed and never
      // replaced by a colour change alone — a colour-only focus state is
      // invisible to exactly the people it exists for.
      focused ? styles.focused : null,
      inactive ? styles.inactive : null,
    ],
    [focused, hovered, inactive, size, styles, variant],
  );

  return (
    <Animated.View style={press.style}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={label}
        accessibilityState={{ disabled: inactive, busy: loading }}
        disabled={inactive}
        onPress={onPress}
        onPressIn={press.onPressIn}
        onPressOut={press.onPressOut}
        {...handlers}
        hitSlop={slop}
        style={pressableStyle}
      >
        {/*
        Both are always mounted; only visibility changes. Swapping the label out
        for a spinner re-measures the button, and the thing beside an
        affirmative action is usually the destructive one.
      */}
        <Text style={[styles.label, ink, loading ? styles.hidden : null]}>{label}</Text>
        {loading ? (
          /*
          Hidden from the accessibility tree, and that is the accessible
          choice rather than a shortcut. The `Pressable` above already carries
          `accessibilityState={{ busy: loading }}`, so a reader announces
          "Save, busy"; leaving the indicator exposed adds a second, unnamed
          announcement of the same fact — which is what `aria-progressbar-name`
          fires on. The state is the semantics; the spinner is the picture of
          it.
        */
          <View style={styles.spinner} aria-hidden>
            <ActivityIndicator size="small" color={ink.color} />
          </View>
        ) : null}
      </Pressable>
    </Animated.View>
  );
}

/**
 * One stylesheet rather than three, because `makeStyles` builds per theme and
 * three caches would be three chances for one of them to miss.
 */
const useStyles = makeStyles((theme) => ({
  variantPrimary: { backgroundColor: theme.accent },
  variantSecondary: { borderWidth: 1, borderColor: theme.border },
  variantGhost: {},
  variantDanger: { borderWidth: 1, borderColor: theme.dangerBorder },

  // `textOnAccent`, not `surface`. They are the same value in light and are not
  // the same thing: one is a card's background, the other is a label sitting on
  // a filled button. See `theme/roles.ts`.
  inkPrimary: { color: theme.textOnAccent },
  inkSecondary: { color: theme.accentText },
  inkGhost: { color: theme.textMuted },
  inkDanger: { color: theme.dangerText },

  hovered: { backgroundColor: theme.hoverFill },
  focused: {
    outlineWidth: focus.width,
    outlineColor: theme.focusRing,
    outlineOffset: focus.offset,
  },

  base: {
    justifyContent: "center",
    alignItems: "center",
    paddingHorizontal: space.x3,
    borderRadius: radius.sm,
  },
  label: { ...text.ui("body", 600) },
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
  inactive: { opacity: 0.45 },
}));

const VARIANT_STYLE = {
  primary: "variantPrimary",
  secondary: "variantSecondary",
  ghost: "variantGhost",
  danger: "variantDanger",
} as const satisfies Record<ButtonVariant, string>;

const INK_STYLE = {
  primary: "inkPrimary",
  secondary: "inkSecondary",
  ghost: "inkGhost",
  danger: "inkDanger",
} as const satisfies Record<ButtonVariant, string>;
