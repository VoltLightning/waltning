/**
 * `<SearchField>` — `design-system/03` §3.7: leading icon, clear button, live
 * results.
 *
 * **`role="searchbox"` is the DOM widget role, not `accessibilityRole`'s
 * `"search"`.** `"search"` is a landmark — the region a page's search lives
 * in — and this is the input itself; naming the wrong one tells a screen
 * reader this box contains a search rather than that it is one. React
 * Native's `Role` union (the newer prop, distinct from the legacy
 * `AccessibilityRole` `select.tsx`'s roles use) is the one that carries
 * `"searchbox"`, so it is passed directly rather than through `useInteraction`.
 *
 * **The magnifier and the clear cross are drawn**, the same vocabulary as
 * `FloatingAdd`'s plus and `Select`'s token ×: a ring and a short diagonal
 * bar, borders rather than a glyph, so it never depends on a font shipping
 * one.
 *
 * **The clear control appears only with a value.** An always-visible clear
 * button on an empty field is a target with nothing to do — the same
 * reasoning `TextField`'s counter uses for `maxLength`.
 *
 * **The result count is a visible line, not only an announcement.** It is
 * `accessibilityLiveRegion="polite"` *and* on the page — a live region with no
 * visible text is invisible to the person typing, not only to the reader
 * behind them.
 */

import { useCallback } from "react";
import { Pressable, Text, TextInput, View } from "react-native";
import { useT } from "../i18n/provider";
import { text } from "../theme/fonts.ts";
import { useTheme } from "../theme/provider";
import { makeStyles } from "../theme/styles.ts";
import { focus, radius, space, touchTarget } from "../tokens.ts";
import { useInteraction } from "./interaction.ts";

export type SearchFieldProps = {
  value: string;
  onChangeText: (value: string) => void;
  placeholder: string;
  /** Called after the value is cleared — the field's own text always empties first. */
  onClear?: () => void;
  autoFocus?: boolean;
  /** Live match count. Absent while there is nothing to report yet (before typing). */
  resultCount?: number;
};

/** Drawn at 20, hit-slop restores the §10 floor — `select.tsx`'s token does the same. */
const CLEAR_SLOP = (touchTarget.min - 20) / 2;

export function SearchField({
  value,
  onChangeText,
  placeholder,
  onClear,
  autoFocus = false,
  resultCount,
}: SearchFieldProps) {
  const t = useT();
  const theme = useTheme();
  const styles = useStyles();
  const { focused, handlers } = useInteraction();

  const handleFocus = useCallback(() => handlers.onFocus(), [handlers]);
  const handleBlur = useCallback(() => handlers.onBlur(), [handlers]);
  const handleClear = useCallback(() => {
    onChangeText("");
    onClear?.();
  }, [onChangeText, onClear]);

  const showClear = value !== "";
  const resultsMessage =
    resultCount === undefined
      ? undefined
      : resultCount === 1
        ? t("common.resultsOne", { count: resultCount })
        : t("common.resultsMany", { count: resultCount });

  return (
    <View style={styles.root}>
      <View style={[styles.field, focused ? styles.focused : null]}>
        <View style={styles.glass}>
          <View style={styles.glassRing} />
          <View style={styles.glassHandle} />
        </View>
        <TextInput
          role="searchbox"
          accessibilityLabel={placeholder}
          value={value}
          onChangeText={onChangeText}
          placeholder={placeholder}
          placeholderTextColor={theme.textMuted}
          autoFocus={autoFocus}
          onFocus={handleFocus}
          onBlur={handleBlur}
          style={styles.input}
        />
        {showClear ? (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={t("common.clear")}
            onPress={handleClear}
            hitSlop={CLEAR_SLOP}
            style={styles.clear}
          >
            <View style={styles.clearCross}>
              <View style={[styles.clearCrossBar, styles.clearCrossBarA]} />
              <View style={[styles.clearCrossBar, styles.clearCrossBarB]} />
            </View>
          </Pressable>
        ) : null}
      </View>
      {resultsMessage === undefined ? null : (
        <Text accessibilityLiveRegion="polite" style={styles.results}>
          {resultsMessage}
        </Text>
      )}
    </View>
  );
}

const useStyles = makeStyles((theme) => ({
  root: { gap: space.xs },
  field: {
    minHeight: touchTarget.min,
    flexDirection: "row",
    alignItems: "center",
    gap: space.md,
    borderWidth: 1,
    borderColor: theme.borderInteractive,
    borderRadius: radius.sm,
    backgroundColor: theme.surface,
    paddingHorizontal: space.x2,
  },
  focused: {
    borderColor: theme.borderStrong,
    outlineWidth: focus.width,
    outlineColor: theme.focusRing,
    outlineOffset: focus.offset,
  },
  glass: { width: 16, height: 16, alignItems: "center", justifyContent: "center" },
  glassRing: {
    width: 10,
    height: 10,
    borderRadius: radius.pill,
    borderWidth: 1.5,
    borderColor: theme.textMuted,
  },
  glassHandle: {
    position: "absolute",
    width: 1.5,
    height: 6,
    backgroundColor: theme.textMuted,
    transform: [{ rotate: "45deg" }],
    right: 1,
    bottom: 0,
  },
  input: { flex: 1, color: theme.text, minHeight: touchTarget.min, ...text.ui("body") },
  clear: { width: 20, height: 20, alignItems: "center", justifyContent: "center" },
  /** The ×, drawn: two bars crossed — `select.tsx`'s token cross, same construction. */
  clearCross: { width: 10, height: 10, alignItems: "center", justifyContent: "center" },
  clearCrossBar: { position: "absolute", width: 11, height: 1.5, backgroundColor: theme.textMuted },
  clearCrossBarA: { transform: [{ rotate: "45deg" }] },
  clearCrossBarB: { transform: [{ rotate: "-45deg" }] },
  results: { color: theme.textMuted, paddingHorizontal: space.xs, ...text.ui("caption") },
}));
