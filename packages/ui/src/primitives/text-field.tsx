/**
 * `<TextField>` — `design-system/03` §3.7. Label, hint, error, counter.
 *
 * The one text input, so that no screen builds its own again —
 * `create-account-form` carried a raw `TextInput` with local border styling,
 * which is the same defect as a local colour: right on the screen it was
 * written on, unavailable to every other.
 *
 * **The error replaces the hint; it does not stack under it.** The hint is
 * what to type; the error is why what was typed does not work. They answer the
 * same question at different moments, and showing both makes the reader
 * reconcile them. The border turns with the message so the field itself is
 * findable from across the form — but the message carries the meaning, never
 * the colour alone (P5).
 *
 * **The counter appears only when a limit exists**, because `12/∞` is not
 * information. It counts up rather than down: "97/120" states a fact where
 * "23 left" sets a deadline.
 */

import { useCallback } from "react";
import { Text, TextInput, View } from "react-native";
import { text } from "../theme/fonts.ts";
import { useTheme } from "../theme/provider";
import { makeStyles } from "../theme/styles.ts";
import { focus, radius, space, touchTarget } from "../tokens.ts";
import { useInteraction } from "./interaction.ts";

export type TextFieldProps = {
  /** Visible above the field and announced as its name. */
  label: string;
  value: string;
  onChangeText: (value: string) => void;
  placeholder?: string;
  /** What to type — shown until an error replaces it. */
  hint?: string;
  /** Why the current value is refused. Replaces the hint while present. */
  error?: string;
  maxLength?: number;
  /** Show the character counter. Needs `maxLength` to mean anything. */
  counter?: boolean;
  disabled?: boolean;
  autoFocus?: boolean;
  /**
   * Fires on blur, after the field's own focus ring already cleared. S15 §7:
   * the near-match check runs on blur of the name field, "not on every
   * keystroke — warning while someone is still typing `Ann` is noise."
   */
  onBlur?: () => void;
  /**
   * `label` becomes the accessible name only — no visible `<Text>` above the
   * field. For a field whose `placeholder` already carries the label (a
   * search field stating what it searches), a kicker line repeating the same
   * word is a duplicate, not a second piece of information. `label` stays
   * required either way: this option changes where it renders, not whether
   * one exists.
   */
  hideLabel?: boolean;
  /**
   * `"decimal-pad"` for a field that only ever holds a typed amount (a
   * transfer's fee, §7.5) — the same keyboard `AmountField`'s own
   * `TextInput` hardcodes, offered here rather than duplicating the input.
   * Defaults to the platform's ordinary text keyboard.
   */
  keyboardType?: "default" | "decimal-pad";
};

export function TextField({
  label,
  value,
  onChangeText,
  placeholder,
  hint,
  error,
  maxLength,
  counter = false,
  disabled = false,
  autoFocus = false,
  onBlur,
  hideLabel = false,
  keyboardType = "default",
}: TextFieldProps) {
  const styles = useStyles();
  const theme = useTheme();
  const { hovered, focused, handlers } = useInteraction();

  // Named here so the JSX passes a reference (architecture/11 bans inline
  // functions in JSX), and so focus/blur reach both the ring and the caller.
  const handleFocus = useCallback(() => handlers.onFocus(), [handlers]);
  const handleBlur = useCallback(() => {
    handlers.onBlur();
    onBlur?.();
  }, [handlers, onBlur]);

  const message = error ?? hint;
  const showCounter = counter && maxLength !== undefined;

  return (
    <View style={styles.root}>
      {hideLabel ? null : <Text style={styles.label}>{label}</Text>}
      <TextInput
        accessibilityLabel={label}
        value={value}
        onChangeText={onChangeText}
        editable={!disabled}
        keyboardType={keyboardType}
        // `editable={false}` maps to read-only on the web, which is a
        // different promise: a read-only field's text must still meet
        // contrast, a disabled one's need not (and, faded to 45%, cannot).
        // The state has to be *announced* for the fade to be honest — and it
        // has to be the `aria-disabled` prop: `accessibilityState` does not
        // reach the DOM through react-native-web's TextInput, which is how
        // the visual suite's axe pass caught this in the first place.
        aria-disabled={disabled}
        autoFocus={autoFocus}
        {...(placeholder === undefined ? {} : { placeholder })}
        placeholderTextColor={theme.textMuted}
        {...(maxLength === undefined ? {} : { maxLength })}
        onFocus={handleFocus}
        onBlur={handleBlur}
        onPointerEnter={handlers.onHoverIn}
        onPointerLeave={handlers.onHoverOut}
        style={[
          styles.input,
          hovered && !disabled && !focused ? styles.inputHovered : null,
          focused ? styles.inputFocused : null,
          error === undefined ? null : styles.inputError,
          disabled ? styles.inputDisabled : null,
        ]}
      />
      {message === undefined && !showCounter ? null : (
        <View style={styles.meta}>
          {message === undefined ? (
            <View style={styles.spacer} />
          ) : (
            <Text style={[styles.hint, error === undefined ? null : styles.error]}>{message}</Text>
          )}
          {showCounter ? (
            <Text style={styles.counter}>
              {value.length}/{maxLength}
            </Text>
          ) : null}
        </View>
      )}
    </View>
  );
}

const useStyles = makeStyles((theme) => ({
  root: { gap: space.sm },
  label: { color: theme.textMuted, ...text.ui("kicker") },
  input: {
    minHeight: touchTarget.min,
    borderWidth: 1,
    borderColor: theme.borderInteractive,
    borderRadius: radius.sm,
    backgroundColor: theme.surface,
    color: theme.text,
    paddingHorizontal: space.x2,
    ...text.ui("body"),
  },
  inputHovered: { borderColor: theme.borderStrong },
  inputFocused: {
    borderColor: theme.borderStrong,
    outlineWidth: focus.width,
    outlineColor: theme.focusRing,
    outlineOffset: focus.offset,
  },
  inputError: { borderColor: theme.dangerBorder },
  inputDisabled: { opacity: 0.45 },
  meta: { flexDirection: "row", alignItems: "flex-start", gap: space.md },
  spacer: { flex: 1 },
  hint: { flex: 1, color: theme.textMuted, ...text.ui("caption") },
  error: { color: theme.dangerText },
  counter: { color: theme.textMuted, ...text.ui("caption") },
}));
