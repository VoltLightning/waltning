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

import { useCallback } from "react";
import { Animated, Pressable, Text, View } from "react-native";
import { useT } from "../i18n/provider";
import { text } from "../theme/fonts.ts";
import { makeStyles } from "../theme/styles.ts";
import { focus, radius, space, touchTarget } from "../tokens.ts";
import { useInteraction } from "./interaction.ts";
import { usePressScale } from "./press-scale.ts";

export type ChipProps = {
  /** Shown when there is no value. A chip with neither reads as broken. */
  placeholder: string;
  value?: string | undefined;
  /**
   * This chip is the current pick among its siblings.
   *
   * **Paint and state, never a suffix.** An earlier version appended
   * "· selected" to the visible value — the accessibility announcement leaking
   * into the picture, so every chosen chip read as a longer label. Selection
   * is the accent fill, the drawn check, and the checked state; the label
   * stays the label.
   *
   * **Passing this prop changes what the chip *is*.** A chip that can be the
   * pick is one of an exclusive set — a radio in a pill costume — so it takes
   * the radio role and `checked`, which is the pair ARIA actually allows
   * (`aria-selected` on a button is an axe violation, and the story suite
   * refused it). Left undefined, the chip stays a plain button: the composer
   * chips that open pickers are actions, not options.
   */
  selected?: boolean;
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
  selected,
  onPress,
  machineFilled = false,
  disabled = false,
}: ChipProps) {
  const t = useT();
  const { hovered, focused, handlers } = useInteraction();
  const filled = value !== undefined && value !== "";
  const selectable = selected !== undefined;

  const styles = useStyles();
  const press = usePressScale();
  const pressableStyle = useCallback(
    () => [
      styles.chip,
      filled ? styles.filled : styles.empty,
      selected === true ? styles.selected : null,
      machineFilled ? styles.machine : null,
      // Under the machine amber the neutral hover would read as a state
      // change; the pointer answer there is the press scale alone.
      hovered && !disabled && !machineFilled ? styles.hovered : null,
      focused ? styles.focused : null,
      disabled ? styles.disabled : null,
    ],
    [disabled, filled, focused, hovered, machineFilled, selected, styles],
  );

  return (
    <Animated.View style={press.style}>
      <Pressable
        // The state is announced, not only drawn. A marker that exists in colour
        // alone is not a marker for someone using a screen reader.
        accessibilityLabel={
          machineFilled
            ? t("common.autoFilledLabel", { field: placeholder, value: value ?? "" })
            : filled
              ? t("common.fieldValue", { field: placeholder, value })
              : placeholder
        }
        accessibilityRole={selectable ? "radio" : "button"}
        accessibilityState={selectable ? { disabled, checked: selected } : { disabled }}
        // And the same fact as the ARIA prop. react-native-web drops both
        // `selected` and `checked` from a Pressable's accessibilityState —
        // the same silence the visual suite caught on TextField's `disabled`
        // — while `aria-checked` reaches the DOM there and maps back onto
        // accessibilityState natively. A radio with no `aria-checked` is
        // itself an axe violation, so the story suite pins this staying.
        {...(selectable ? { "aria-checked": selected } : {})}
        disabled={disabled}
        onPress={onPress}
        onPressIn={press.onPressIn}
        onPressOut={press.onPressOut}
        {...handlers}
        style={pressableStyle}
      >
        <Text
          style={[
            styles.text,
            filled ? styles.textFilled : styles.textEmpty,
            selected === true ? styles.textSelected : null,
          ]}
        >
          {filled ? value : placeholder}
          {/* Text, not tint alone (P5) — and the one character that fits. */}
          {machineFilled ? <Text style={styles.marker}>{t("common.autoFilled")}</Text> : null}
        </Text>
        {/* The drawn check — the same selection mark the select's rows carry,
            so "chosen" looks like one thing everywhere. Also the non-colour
            half of the signal (P5). */}
        {selected === true ? <View style={styles.check} /> : null}
      </Pressable>
    </Animated.View>
  );
}

const useStyles = makeStyles((theme) => ({
  chip: {
    // The §3.5 defect, fixed at the source rather than on thirty screens.
    minHeight: touchTarget.min,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: space.md,
    borderRadius: radius.sm,
    paddingHorizontal: space.x3,
    borderWidth: 1,
  },
  // `borderInteractive`, not `border`: a chip is a control, and the scale
  // gives a control's resting edge one step more presence than a card's.
  empty: { borderColor: theme.borderInteractive, backgroundColor: "transparent" },
  filled: { borderColor: theme.borderInteractive, backgroundColor: theme.subtleFill },
  /** The pick: the same fill, edge and mark as a select's chosen row. */
  selected: { borderColor: theme.accentFillBorder, backgroundColor: theme.accentFill },
  /** Amber: asserted rather than chosen (P4), one meaning with every other amber. */
  machine: { borderColor: theme.assertedBorder, backgroundColor: theme.assertedFill },
  hovered: { backgroundColor: theme.hoverFill },
  focused: {
    outlineWidth: focus.width,
    outlineColor: theme.focusRing,
    outlineOffset: focus.offset,
  },
  disabled: { opacity: 0.45 },
  text: { ...text.ui("body") },
  textEmpty: { color: theme.textMuted },
  textFilled: { color: theme.text },
  textSelected: { color: theme.accentText, ...text.ui("body", 600) },
  marker: { color: theme.assertedText, ...text.ui("caption") },
  check: {
    width: 11,
    height: 6,
    borderLeftWidth: 2,
    borderBottomWidth: 2,
    borderColor: theme.accentText,
    transform: [{ rotate: "-45deg" }],
    marginTop: -2,
  },
}));
