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

import { useState } from "react";
import { Pressable, Text } from "react-native";
import { makeStyles } from "../theme/index.ts";
import { focus, radius, space, touchTarget, type } from "../tokens.ts";

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
  const [focused, setFocused] = useState(false);
  const filled = value !== undefined && value !== "";

  const styles = useStyles();

  return (
    <Pressable
      accessibilityRole="button"
      // The state is announced, not only drawn. A marker that exists in colour
      // alone is not a marker for someone using a screen reader.
      accessibilityLabel={
        machineFilled
          ? `${placeholder}: ${value ?? ""}, filled automatically`
          : `${placeholder}${filled ? `: ${value}` : ""}`
      }
      accessibilityState={{ disabled }}
      disabled={disabled}
      onPress={onPress}
      onFocus={() => setFocused(true)}
      onBlur={() => setFocused(false)}
      style={({ pressed }) => [
        styles.chip,
        filled ? styles.filled : styles.empty,
        machineFilled ? styles.machine : null,
        pressed ? styles.pressed : null,
        focused ? styles.focused : null,
        disabled ? styles.disabled : null,
      ]}
    >
      <Text style={[styles.text, filled ? styles.textFilled : styles.textEmpty]}>
        {filled ? value : placeholder}
        {/* Text, not tint alone (P5) — and the one character that fits. */}
        {machineFilled ? <Text style={styles.marker}> ·auto</Text> : null}
      </Text>
    </Pressable>
  );
}

const useStyles = makeStyles((t) => ({
  chip: {
    // The §3.5 defect, fixed at the source rather than on thirty screens.
    minHeight: touchTarget.min,
    justifyContent: "center",
    borderRadius: radius.pill,
    paddingHorizontal: space.x3,
    borderWidth: 1,
  },
  empty: { borderColor: t.border, backgroundColor: "transparent" },
  filled: { borderColor: t.border, backgroundColor: t.subtleFill },
  /** Amber: asserted rather than chosen (P4), one meaning with every other amber. */
  machine: { borderColor: t.assertedBorder, backgroundColor: t.assertedFill },
  pressed: { opacity: 0.85 },
  focused: { outlineWidth: focus.width, outlineColor: t.focusRing, outlineOffset: focus.offset },
  disabled: { opacity: 0.45 },
  text: { fontSize: type.body.fontSize },
  textEmpty: { color: t.textMuted },
  textFilled: { color: t.text },
  marker: { color: t.assertedText, fontSize: type.caption.fontSize },
}));
