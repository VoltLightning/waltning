/**
 * `<IconButton>` — `design-system/03` §3.2.
 *
 * **44 is the floor for any touch target** (§10), and this is the one place it
 * is fixed. §3.5 records that chips currently measure ~34 against it; fixing
 * that across thirty screens is a week and fixing it here is a day.
 *
 * The size prop sets the *visual* size. The **hit area is never smaller than
 * 44** regardless — a 32px icon button is a legitimate design and an
 * unreachable target, and the two are separable.
 *
 * `label` is required, not optional. An icon-only control with no accessible
 * name is a button that announces itself as "button" and nothing else.
 */

import { useCallback } from "react";
import { Pressable, View } from "react-native";
import { makeStyles } from "../theme/styles.ts";
import { focus, radius, touchTarget } from "../tokens.ts";
import { useInteraction } from "./interaction.ts";

export type IconButtonSize = 32 | 40 | 44;

export type IconButtonProps = {
  /** The accessible name. Required — §3.2 says so, and so does §10. */
  label: string;
  onPress: () => void;
  size?: IconButtonSize;
  disabled?: boolean;
  /**
   * The ground it sits on: `"ground"` (default) — a card or the page;
   * `"shell"` — the sage band.
   *
   * **The fills are not interchangeable, and the failure is total.** `hoverFill`
   * and `pressedFill` are ground-family creams; painted behind a `shellText`
   * glyph on the band they leave it at **1.10:1** in light, which is a control
   * that vanishes the moment a pointer touches it. `button.tsx` guards the same
   * hazard by excluding `hoverFill` from its `primary` variant. On the shell
   * the lit/recessed pair is an alpha overlay — `shellNavActiveFill` and
   * `shellInsetTrackFill` — which darkens or lifts the one flat green without
   * introducing a second colour to keep in sync.
   */
  tone?: "ground" | "shell";
  children: React.ReactNode;
};

export function IconButton({
  label,
  onPress,
  size = 40,
  disabled = false,
  tone = "ground",
  children,
}: IconButtonProps) {
  const { hovered, focused, handlers } = useInteraction();

  // The gap between the drawn control and the 44px floor, split either side.
  // `hitSlop` rather than padding so the visual size stays what was asked for.
  const slop = Math.max(0, (touchTarget.min - size) / 2);

  const styles = useStyles();
  const pressableStyle = useCallback(
    ({ pressed }: { pressed: boolean }) => [
      styles.base,
      { width: size, height: size },
      // Hover under press: the pressed fill is one step darker and must win.
      hovered && !disabled ? (tone === "shell" ? styles.hoveredShell : styles.hovered) : null,
      pressed ? (tone === "shell" ? styles.pressedShell : styles.pressed) : null,
      focused ? styles.focused : null,
      focused && tone === "shell" ? styles.focusedShell : null,
      disabled ? styles.disabled : null,
    ],
    [disabled, focused, hovered, size, styles, tone],
  );

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ disabled }}
      disabled={disabled}
      onPress={onPress}
      {...handlers}
      hitSlop={slop}
      style={pressableStyle}
    >
      <View style={styles.content}>{children}</View>
    </Pressable>
  );
}

const useStyles = makeStyles((theme) => ({
  base: { alignItems: "center", justifyContent: "center", borderRadius: radius.sm },
  content: { alignItems: "center", justifyContent: "center" },
  hovered: { backgroundColor: theme.hoverFill },
  pressed: { backgroundColor: theme.pressedFill },
  /** Alpha over the one flat green — see `tone`. Lit under a pointer, recessed under a finger. */
  hoveredShell: { backgroundColor: theme.shellNavActiveFill },
  pressedShell: { backgroundColor: theme.shellInsetTrackFill },
  focused: {
    outlineWidth: focus.width,
    outlineColor: theme.focusRing,
    outlineOffset: focus.offset,
  },
  /**
   * **The ring on the band is near-white, not green.** `focusRing` is
   * `accentIcon`, which is 2.04:1 on `shell` in light — under 1.4.11's 3:1 for
   * a boundary, and invisible on the one ground the contrast census does not
   * walk. `shellFocusRing` is `shellText`: 7.77:1 light, 7.94:1 dark.
   */
  focusedShell: { outlineColor: theme.shellFocusRing },
  disabled: { opacity: 0.45 },
}));
