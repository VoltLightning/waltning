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
 *
 * **`danger` is filled, and that is the point** (§2.6c). It was an outlined
 * red button, which put it at exactly the weight of the outlined grey one it
 * stands next to: in `ConfirmDialog` the destroying action and the way out of
 * it were the same object in two hues, four pixels apart, and hue alone is not
 * separation — `02` §2.4 says so about every other pair in the system. Solid
 * against outlined survives a greyscale screenshot and a reader who cannot
 * tell the two reds from the two greys.
 *
 * This does not make two primaries: §3.1's rule is about two buttons competing
 * to be the *affirmative* one, and a filled red is not competing for that. It
 * is the loudest thing in its pair because it is the thing that cannot be
 * undone, and the escape beside it stays quiet on purpose.
 *
 * **There is no quiet red, and an attempt at one was withdrawn.** *Cannot be
 * undone* is the whole licence for the fill, so a first correction gave
 * reversible-destructive (Archive) an outlined `dangerQuiet` instead — which
 * was byte-identical to the variant filling `danger` had just replaced, and
 * landed it beside `secondary` in `AccountEditor` at **1.0079:1**: the same
 * object in two colours, four pixels apart, which is the precise defect this
 * whole section exists to remove. Re-adding it under a new name did not make
 * it a different control.
 *
 * Archiving destroys nothing — an archived account comes back from a toggle —
 * so it is an ordinary `secondary` action. Red that shows up on things you
 * can undo is red nobody believes.
 */

import { useCallback } from "react";
import { ActivityIndicator, Pressable, Text, View } from "react-native";
import Animated from "react-native-reanimated";
import { focusBorder, focusRing } from "../../../theme/focus.ts";
import { text } from "../../../theme/fonts.ts";
import { makeStyles } from "../../../theme/styles.ts";
import { radius, space, touchTarget } from "../../../tokens.ts";
import { useInteraction } from "../../interaction.ts";
import { usePressScale } from "../../press-scale.ts";

export type ButtonVariant = "primary" | "secondary" | "ghost" | "danger";
export type ButtonSize = "sm" | "md" | "lg";

export type ButtonProps = {
  label: string;
  onPress: () => void;
  variant: ButtonVariant;
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
  variant,
  size = "md",
  disabled = false,
  loading = false,
}: ButtonProps) {
  const inactive = disabled || loading;

  const { hovered, focused, handlers } = useInteraction();
  const styles = useStyles();
  const ink =
    variant === "ghost" && hovered && !inactive
      ? styles.inkGhostHovered
      : styles[INK_STYLE[variant]];
  const press = usePressScale();
  const slop = Math.max(0, (touchTarget.min - HEIGHT[size]) / 2);
  const pressableStyle = useCallback(
    () => [
      styles.base,
      { height: HEIGHT[size] },
      styles[VARIANT_STYLE[variant]],
      // The outlined variants take `hoverFill` under a pointer; the two filled
      // ones get their liveliness from the press scale alone — a second green
      // or red for one state would be a new role.
      hovered && !inactive && variant !== "primary" && variant !== "danger" ? styles.hovered : null,
      // §2.6: on **every** interactive element, never removed and never
      // replaced by a colour change alone — a colour-only focus state is
      // invisible to exactly the people it exists for.
      focused ? (variant === "secondary" ? styles.focusedBordered : styles.focused) : null,
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
  // **These two have no fill, so the edge is the whole control.** `theme.border`
  // is a divider colour — 1.19:1 on the ground a button sits on, 1.02 under a
  // pointer — and an outlined button drawn in it is a control WCAG 1.4.11 says
  // cannot be located.
  //
  // `borderInteractive`, the resting edge every other control in the system
  // uses — `Chip`, the account tile, the category cell, the currency tile, the
  // composer's kind option. `borderStrong` was tried here on the argument that
  // an action should outrank a receptacle, and it does not survive: the ramp is
  // documented as "a selected control, a focus-adjacent edge", a resting button
  // is neither, and a `TextField` strengthens to `borderStrong` on hover *and*
  // focus, so the separation lasted exactly one state. A button that starts at
  // the top of the ramp also has nowhere left to go.
  variantSecondary: { borderWidth: 1, borderColor: theme.borderInteractive },
  variantGhost: {},
  variantDanger: { backgroundColor: theme.dangerSolid },

  // `textOnAccent`, not `surface`. They are the same value in light and are not
  // the same thing: one is a card's background, the other is a label sitting on
  // a filled button. See `theme/roles.ts`.
  inkPrimary: { color: theme.textOnAccent },
  inkSecondary: { color: theme.accentText },
  inkGhost: { color: theme.textMuted },
  /**
   * `textMuted` on `hoverFill` measured 4.47:1 when this was written — under the 4.5:1 floor by a
   * hair, and invisible until a real story left a ghost button hovered under
   * axe (`QuickAddForm`'s `More`). `inkSecondary` and `inkDanger` sit on the
   * same fill well clear of the line, so only ghost needs its own hover ink;
   * full-strength `theme.text` is the label's resting colour on every other
   * surface in the system, not a new role invented for this one state.
   */
  inkGhostHovered: { color: theme.text },
  inkDanger: { color: theme.textOnDanger },

  hovered: { backgroundColor: theme.hoverFill },
  /**
   * Only `secondary` draws a border, so only `secondary` can show focus in
   * one. The three filled or bare variants have no edge to turn and keep the
   * ring — which is the rule stated, not an exception to it.
   */
  focused: focusRing(theme.focusRing),
  focusedBordered: focusBorder(theme.focusRing, { horizontal: space.x3 }),

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
