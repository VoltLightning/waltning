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
  children: React.ReactNode;
};

export function IconButton({
  label,
  onPress,
  size = 40,
  disabled = false,
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
      hovered && !disabled ? styles.hovered : null,
      pressed ? styles.pressed : null,
      focused ? styles.focused : null,
      disabled ? styles.disabled : null,
    ],
    [disabled, focused, hovered, size, styles],
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
  focused: {
    outlineWidth: focus.width,
    outlineColor: theme.focusRing,
    outlineOffset: focus.offset,
  },
  disabled: { opacity: 0.45 },
}));
