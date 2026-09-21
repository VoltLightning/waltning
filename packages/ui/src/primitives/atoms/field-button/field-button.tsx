/**
 * `<FieldButton>` — a field that opens something instead of being typed into.
 *
 * **It looks like `TextField` because in a form it *is* one** — a labelled box
 * holding a value, with a hint or a refusal under it — and the only difference
 * is what a tap does. `DateField` and `TimeField` are this on a phone: the tap
 * opens the drum, with nothing in between. They used to be a text input with a
 * row of chips under it, one of which opened the drum — so setting a date was
 * *tap the row, find the chip, tap the chip* — and on Add that whole
 * arrangement sat inside a bottom sheet of its own, a third step.
 *
 * A `button`, not a disabled input: a non-editable `TextInput` swallows the
 * tap on Android, and says *text field, dimmed* to a screen reader about a
 * control that is neither.
 */

import { Text, View } from "react-native";
import { focusBorder } from "../../../theme/focus.ts";
import { text } from "../../../theme/fonts.ts";
import { makeStyles } from "../../../theme/styles.ts";
import { radius, space, touchTarget } from "../../../tokens.ts";
import { useInteraction } from "../../interaction.ts";
import { PressableScaled } from "../pressable-scaled/pressable-scaled";

export type FieldButtonProps = {
  label: string;
  /** What the field holds, already worded for a reader — or `undefined` for empty. */
  value: string | undefined;
  /** What an empty field says. */
  placeholder: string;
  onPress: () => void;
  error?: string;
  hint?: string;
};

export function FieldButton({ label, value, placeholder, onPress, error, hint }: FieldButtonProps) {
  const styles = useStyles();
  const { hovered, focused, handlers } = useInteraction();
  const message = error ?? hint;
  const shown = value ?? placeholder;

  return (
    <View style={styles.root}>
      <Text style={styles.label}>{label}</Text>
      <PressableScaled
        accessibilityRole="button"
        // The label and the value, because a button named only *Date* does not
        // say which date it is about to change.
        accessibilityLabel={`${label}: ${shown}`}
        onPress={onPress}
        {...handlers}
        style={[
          styles.box,
          hovered && !focused ? styles.boxHovered : null,
          error === undefined
            ? focused
              ? styles.boxFocused
              : null
            : focused
              ? styles.boxErrorFocused
              : styles.boxError,
        ]}
      >
        <Text
          style={[styles.value, value === undefined ? styles.placeholder : null]}
          numberOfLines={1}
        >
          {shown}
        </Text>
      </PressableScaled>
      {message === undefined ? null : (
        <Text style={[styles.hint, error === undefined ? null : styles.error]}>{message}</Text>
      )}
    </View>
  );
}

const useStyles = makeStyles((theme) => ({
  root: { gap: space.sm },
  label: { color: theme.textMuted, ...text.ui("kicker") },
  box: {
    minHeight: touchTarget.min,
    justifyContent: "center",
    borderWidth: 1,
    borderColor: theme.borderInteractive,
    borderRadius: radius.sm,
    backgroundColor: theme.surface,
    paddingHorizontal: space.x2,
  },
  boxHovered: { borderColor: theme.borderStrong },
  boxFocused: focusBorder(theme.focusRing, { horizontal: space.x2 }),
  boxError: { borderColor: theme.dangerBorder },
  boxErrorFocused: focusBorder(theme.dangerBorder, { horizontal: space.x2 }),
  value: { color: theme.text, ...text.ui("body") },
  placeholder: { color: theme.textMuted },
  hint: { color: theme.textMuted, ...text.ui("caption") },
  error: { color: theme.dangerText },
}));
