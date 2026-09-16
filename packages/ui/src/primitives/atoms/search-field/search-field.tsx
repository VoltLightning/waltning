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
 * **The clear control appears only with a value — unless there is a search to
 * leave.** An always-visible clear button on an empty field is a target with
 * nothing to do, which is why `onClear` alone still hides it. A caller that
 * passes `onDismiss` has given it something to do: S04 §7 pins this field open
 * "for as long as the search is on", so on that screen the × is the only way
 * back out, and hiding it on an empty field stranded the reader in a narrowed
 * ledger with no exit — open the search, type nothing, and there was no way to
 * close it.
 *
 * **No border, no fill.** The field is composed *inline* under the tabs rather
 * than as a box sitting on them: the leading magnifier and the placeholder say
 * what it is, and a boxed input on the ground read as a second surface floating
 * over the one the page already had.
 *
 * **The ring is for a keyboard, and `autoFocus` is not one.** §10 wants a
 * visible focus indicator, and this field takes focus the instant it opens —
 * so the ring painted a heavy box around the very field the border was just
 * removed from, on every open, for a reader who reached it by tapping a
 * magnifier and never asked for it. The automatic focus is skipped and every
 * later one rings: tab away and back and the indicator is there. This is
 * `:focus-visible`'s own distinction, drawn for the one case this field has
 * rather than added to `useInteraction`, where it would change every control
 * in the system.
 *
 * **The result count is a visible line, not only an announcement.** It is
 * `accessibilityLiveRegion="polite"` *and* on the page — a live region with no
 * visible text is invisible to the person typing, not only to the reader
 * behind them.
 */

import { useCallback, useRef } from "react";
import { Pressable, Text, TextInput, View } from "react-native";
import { useT } from "../../../i18n/provider";
import { text } from "../../../theme/fonts.ts";
import { useTheme } from "../../../theme/provider";
import { makeStyles } from "../../../theme/styles.ts";
import { focus, radius, space, touchTarget } from "../../../tokens.ts";
import { useInteraction } from "../../interaction.ts";

export type SearchFieldProps = {
  value: string;
  onChangeText: (value: string) => void;
  placeholder: string;
  /** Called after the value is cleared — the field's own text always empties first. */
  onClear?: () => void;
  /**
   * A way out of the search itself, not only its text. When given, the × is
   * offered whether or not anything is typed, and pressing it empties the
   * field and then calls this. S04 §7's pinned field is the caller.
   */
  onDismiss?: () => void;
  autoFocus?: boolean;
  /** Live match count. Absent while there is nothing to report yet (before typing). */
  resultCount?: number;
  /**
   * React 19 accepts `ref` as an ordinary prop on a function component —
   * no `forwardRef` — which is the whole reason this is a plain field here
   * rather than a second, imperative export. S10 §7 (web)'s `F` — "focuses
   * the rail" — is the one caller: `ledger-screen.tsx`'s desk rail keeps a
   * ref to this field's own `TextInput` and calls its built-in `.focus()`.
   */
  ref?: React.Ref<TextInput> | undefined;
};

/** Drawn at 20, hit-slop restores the §10 floor — `select.tsx`'s token does the same. */
const CLEAR_SLOP = (touchTarget.min - 20) / 2;

export function SearchField({
  value,
  onChangeText,
  placeholder,
  onClear,
  onDismiss,
  autoFocus = false,
  resultCount,
  ref,
}: SearchFieldProps) {
  const t = useT();
  const theme = useTheme();
  const styles = useStyles();
  const { focused, handlers } = useInteraction();

  // True until `autoFocus` has spent its one free focus; see the header.
  const pendingAutoFocus = useRef(autoFocus);
  const handleFocus = useCallback(() => {
    if (pendingAutoFocus.current) {
      pendingAutoFocus.current = false;
      return;
    }
    handlers.onFocus();
  }, [handlers]);
  const handleBlur = useCallback(() => handlers.onBlur(), [handlers]);
  const handleClear = useCallback(() => {
    onChangeText("");
    onClear?.();
    onDismiss?.();
  }, [onChangeText, onClear, onDismiss]);

  const showClear = value !== "" || onDismiss !== undefined;
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
          ref={ref}
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
            accessibilityLabel={
              onDismiss === undefined ? t("common.clear") : t("common.closeSearch")
            }
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
  },
  // §2.6: the ring goes on the interactive element, which here is the whole
  // field — `[icon][input][×]` — not the `TextInput` alone. The input keeps
  // its own `outlineWidth: 0` below so the browser's native focus ring never
  // draws on the actual focused DOM node underneath this one.
  //
  // **`outlineStyle` is required, not decorative.** This `View` never
  // receives real DOM focus itself — only a focusable element gets the
  // browser's own `outline-style: auto` for free — so without naming a style
  // here, `outline-style` stays at its CSS-initial `none` and the outline
  // never paints, no matter what `outlineWidth`/`outlineColor` say.
  focused: {
    outlineWidth: focus.width,
    outlineStyle: "solid",
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
  // Suppresses the browser's own native focus ring on this `TextInput` —
  // without it, focusing the field draws that ring *here*, on the actual DOM
  // node that receives focus, bisecting the field instead of enclosing it.
  // The real ring is `focused` above, on the wrapper. **Both properties are
  // required**: Chromium's default `outline-style: auto` renders its own
  // native ring at its own width regardless of an author `outlineWidth: 0`
  // — `auto` defers the whole rendering, width included, to the UA. Naming
  // an actual style (`"solid"`, RN-web's type has no `"none"`) is what makes
  // the explicit zero width win.
  input: {
    flex: 1,
    color: theme.text,
    minHeight: touchTarget.min,
    outlineWidth: 0,
    outlineStyle: "solid",
    ...text.ui("body"),
  },
  clear: { width: 20, height: 20, alignItems: "center", justifyContent: "center" },
  /** The ×, drawn: two bars crossed — `select.tsx`'s token cross, same construction. */
  clearCross: { width: 10, height: 10, alignItems: "center", justifyContent: "center" },
  clearCrossBar: { position: "absolute", width: 11, height: 1.5, backgroundColor: theme.textMuted },
  clearCrossBarA: { transform: [{ rotate: "45deg" }] },
  clearCrossBarB: { transform: [{ rotate: "-45deg" }] },
  results: { color: theme.textMuted, paddingHorizontal: space.xs, ...text.ui("caption") },
}));
