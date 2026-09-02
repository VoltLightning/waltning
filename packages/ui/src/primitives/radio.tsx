/**
 * `<RadioGroup>` — `design-system/03` §3.8. One choice from a short, visible
 * list.
 *
 * Radios are for an exclusive choice whose options should all be *read* before
 * any is picked — an account's kind, a scope for one report. When the options
 * are long or many, `Select` folds them away; when they are a partition being
 * used as a filter, `SegmentControl` is the control; when each row stands
 * alone, `Checkbox`.
 *
 * **The group is the component.** A lone radio is a checkbox with worse
 * manners — the invariant "exactly one selected" belongs to the set, so the
 * set is what the API takes: `options`, `value`, `onChange`, and no way to
 * build the contradiction. This is `<ButtonRow>`'s argument (§3.1) applied to
 * selection: make the wrong composition unrepresentable rather than
 * discouraged.
 *
 * **The dot pops in like the checkbox's mark** — same duration, same curve,
 * because a selection landing is one event across the system, not a per-shape
 * choice. The previous dot vanishes instantly: two animations racing in one
 * group read as indecision.
 */

import { useCallback, useEffect, useRef } from "react";
import { Animated, Pressable, Text, View } from "react-native";
import { text } from "../theme/fonts.ts";
import { makeStyles } from "../theme/styles.ts";
import { focus, motion, radius, space, touchTarget } from "../tokens.ts";
import { easing } from "./easing.ts";
import { useInteraction } from "./interaction.ts";
import { useReducedMotion } from "./reduced-motion.ts";

export type RadioOption = {
  value: string;
  label: string;
  /** A quieter second line under the label. */
  hint?: string;
  disabled?: boolean;
};

export type RadioGroupProps = {
  /** Announced for the group; each option announces its own label. */
  label: string;
  /** Two or more. One option is not a choice. */
  options: readonly [RadioOption, RadioOption, ...RadioOption[]];
  /** `null` before the first pick — a default is the caller's decision. */
  value: string | null;
  onChange: (value: string) => void;
  disabled?: boolean;
};

const RING = 22;
const DOT = 10;

export function RadioGroup({ label, options, value, onChange, disabled = false }: RadioGroupProps) {
  const styles = useStyles();

  return (
    <View accessibilityRole="radiogroup" accessibilityLabel={label} style={styles.group}>
      {options.map((option) => (
        <RadioRow
          key={option.value}
          option={option}
          selected={option.value === value}
          groupDisabled={disabled}
          onChange={onChange}
        />
      ))}
    </View>
  );
}

type RadioRowProps = {
  option: RadioOption;
  selected: boolean;
  groupDisabled: boolean;
  onChange: (value: string) => void;
};

function RadioRow({ option, selected, groupDisabled, onChange }: RadioRowProps) {
  const styles = useStyles();
  const { hovered, focused, handlers } = useInteraction();
  const reduced = useReducedMotion();
  const disabled = groupDisabled || option.disabled === true;

  const pop = useRef(new Animated.Value(selected ? 1 : 0)).current;

  useEffect(() => {
    if (selected) {
      pop.setValue(0.4);
      Animated.timing(pop, {
        toValue: 1,
        duration: reduced ? motion.none.duration : motion.fast.duration,
        easing: easing.fast,
        useNativeDriver: true,
      }).start();
    } else {
      pop.setValue(0);
    }
  }, [pop, reduced, selected]);

  const handlePress = useCallback(() => {
    // Re-picking the selected option is a no-op, not a deselection — a radio
    // group always has an answer once it has one.
    if (!selected) onChange(option.value);
  }, [onChange, option.value, selected]);

  return (
    <Pressable
      accessibilityRole="radio"
      accessibilityLabel={option.label}
      // `checked`, not `selected`: ARIA gives a radio `aria-checked`, and
      // react-native-web silently drops `selected` — the announcement would
      // exist on the phone and vanish on the web.
      accessibilityState={{ checked: selected, disabled }}
      // The ARIA prop too — react-native-web drops `checked` from a
      // Pressable's accessibilityState (see chip.tsx).
      aria-checked={selected}
      disabled={disabled}
      onPress={handlePress}
      {...handlers}
      style={[
        styles.row,
        hovered && !disabled ? styles.hovered : null,
        focused ? styles.focused : null,
        disabled ? styles.rowDisabled : null,
      ]}
    >
      <View style={[styles.ring, selected ? styles.ringSelected : null]}>
        <Animated.View style={[styles.dot, { opacity: pop, transform: [{ scale: pop }] }]} />
      </View>
      <View style={styles.copy}>
        <Text style={styles.label}>{option.label}</Text>
        {option.hint === undefined ? null : <Text style={styles.hint}>{option.hint}</Text>}
      </View>
    </Pressable>
  );
}

const useStyles = makeStyles((theme) => ({
  group: { gap: space.xs },
  row: {
    minHeight: touchTarget.min,
    flexDirection: "row",
    alignItems: "center",
    gap: space.x3,
    borderRadius: radius.sm,
    paddingHorizontal: space.md,
    paddingVertical: space.sm,
  },
  hovered: { backgroundColor: theme.hoverFill },
  focused: {
    outlineWidth: focus.width,
    outlineColor: theme.focusRing,
    outlineOffset: focus.offset,
  },
  rowDisabled: { opacity: 0.45 },
  ring: {
    width: RING,
    height: RING,
    borderRadius: radius.pill,
    borderWidth: 1.5,
    borderColor: theme.borderInteractive,
    backgroundColor: theme.surface,
    alignItems: "center",
    justifyContent: "center",
  },
  // The ring thickens *and* recolours on selection: at 22px the colour change
  // alone is below the size a colour difference can be judged at (P5).
  ringSelected: { borderColor: theme.accent, borderWidth: 2 },
  dot: {
    width: DOT,
    height: DOT,
    borderRadius: radius.pill,
    backgroundColor: theme.accent,
  },
  copy: { flex: 1, gap: 2 },
  label: { color: theme.text, ...text.ui("body") },
  hint: { color: theme.textMuted, ...text.ui("caption") },
}));
