/**
 * `<Chip>` — `design-system/03` §3.5. Interactive: holds a value, opens a picker.
 *
 * **The machine-filled state is P2**, and it is the reason this is not just a
 * button with a label. When the agent or a rule fills a chip, the row must say
 * so — the trail marker is what separates "you chose this" from "something
 * chose this for you", and a person approving a diff needs that distinction more
 * than they need the value.
 *
 * §3.5 records the open defect: *"chips currently measure ~34px against a 44px
 * floor"*. This one does not — `touchTarget.min` is the floor here, fixed at the
 * source, which is what D1 exists for.
 */

import { useCallback, useState } from "react";
import { Animated, Pressable, Text } from "react-native";
import { useT } from "../i18n/provider";
import { text } from "../theme/fonts.ts";
import { makeStyles } from "../theme/styles.ts";
import { focus, radius, space, touchTarget } from "../tokens.ts";
import { usePressScale } from "./press-scale.ts";

export type ChipProps = {
  /** Shown when there is no value. A chip with neither reads as broken. */
  placeholder: string;
  value?: string | undefined;
  onPress: () => void;
  /**
   * Filled by a rule or the agent rather than by a person (P2).
   *
   * Never inferred from "the value arrived without a tap" — that is true of a
   * restored draft too, and marking those would make the marker meaningless.
   */
  machineFilled?: boolean;
  disabled?: boolean;
};

export function Chip({
  placeholder,
  value,
  onPress,
  machineFilled = false,
  disabled = false,
}: ChipProps) {
  const t = useT();
  const [focused, setFocused] = useState(false);
  const filled = value !== undefined && value !== "";

  const styles = useStyles();
  const handleFocus = useCallback(() => setFocused(true), []);
  const handleBlur = useCallback(() => setFocused(false), []);
  const press = usePressScale();
  const pressableStyle = useCallback(
    () => [
      styles.chip,
      filled ? styles.filled : styles.empty,
      machineFilled ? styles.machine : null,
      focused ? styles.focused : null,
      disabled ? styles.disabled : null,
    ],
    [disabled, filled, focused, machineFilled, styles],
  );

  return (
    <Animated.View style={press.style}>
      <Pressable
        accessibilityRole="button"
        // The state is announced, not only drawn. A marker that exists in colour
        // alone is not a marker for someone using a screen reader.
        accessibilityLabel={
          machineFilled
            ? t("common.autoFilledLabel", { field: placeholder, value: value ?? "" })
            : filled
              ? t("common.fieldValue", { field: placeholder, value })
              : placeholder
        }
        accessibilityState={{ disabled }}
        disabled={disabled}
        onPress={onPress}
        onPressIn={press.onPressIn}
        onPressOut={press.onPressOut}
        onFocus={handleFocus}
        onBlur={handleBlur}
        style={pressableStyle}
      >
        <Text style={[styles.text, filled ? styles.textFilled : styles.textEmpty]}>
          {filled ? value : placeholder}
          {/* Text, not tint alone (P5) — and the one character that fits. */}
          {machineFilled ? <Text style={styles.marker}>{t("common.autoFilled")}</Text> : null}
        </Text>
      </Pressable>
    </Animated.View>
  );
}

const useStyles = makeStyles((theme) => ({
  chip: {
    // The §3.5 defect, fixed at the source rather than on thirty screens.
    minHeight: touchTarget.min,
    justifyContent: "center",
    borderRadius: radius.pill,
    paddingHorizontal: space.x3,
    borderWidth: 1,
  },
  // `borderInteractive`, not `border`: a chip is a control, and the scale
  // gives a control's resting edge one step more presence than a card's.
  empty: { borderColor: theme.borderInteractive, backgroundColor: "transparent" },
  filled: { borderColor: theme.borderInteractive, backgroundColor: theme.subtleFill },
  /** Amber: asserted rather than chosen (P4), one meaning with every other amber. */
  machine: { borderColor: theme.assertedBorder, backgroundColor: theme.assertedFill },
  focused: {
    outlineWidth: focus.width,
    outlineColor: theme.focusRing,
    outlineOffset: focus.offset,
  },
  disabled: { opacity: 0.45 },
  text: { ...text.ui("body") },
  textEmpty: { color: theme.textMuted },
  textFilled: { color: theme.text },
  marker: { color: theme.assertedText, ...text.ui("caption") },
}));
