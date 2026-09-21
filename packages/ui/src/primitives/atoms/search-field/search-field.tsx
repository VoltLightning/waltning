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
 * **The magnifier and the clear cross are the vendored icons**
 * (`primitives/icons.tsx`), not shapes built from views. They were a ring and a
 * rotated bar — borders rather than a glyph, so as never to depend on a font —
 * and at 16pt that is a circle with a stick near it: the handle never met the
 * ring, and on a phone it read as a broken icon. A path has no font to depend
 * on either.
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
 * **A field, drawn as one** — `surface`, the interactive edge, `radius.sm`:
 * the same box `TextField` is, because it is the same thing (S10's board draws
 * it so). It was composed inline, bare on the ground, on the argument that a
 * box under the tabs read as a second surface; what it read as instead was a
 * caption — grey words with a mark beside them, on Home, in the Ledger and in
 * every picker, that nothing said could be typed into.
 *
 * **The automatic focus is not marked, and that is a deliberate divergence
 * from §2.6.** This field takes focus the instant it opens, for a reader who
 * got there by tapping a magnifier: a thickened accent edge on every open says
 * *you are here* to someone who has just put themselves there. The automatic
 * focus is skipped; every later one is marked, so tabbing away and back shows
 * the indicator.
 *
 * **This is not `:focus-visible`, and an earlier version of this comment
 * claimed it was — backwards.** Selectors-4's heuristic is that an element
 * which supports keyboard text entry *always* matches `:focus-visible` when
 * focused, precisely because an unmarked text field cannot be told from an
 * unfocused one; Chrome and Firefox both ring a programmatically focused
 * input. This is the single exception `:focus-visible` refuses to make.
 *
 * So it is a **decision with a cost, recorded rather than dressed up**: a
 * sighted keyboard user who opens the search and pauses has only a 1px caret
 * to go on, and WCAG 2.4.7 attaches to focus, never to how focus arrived. The
 * alternative on the table was a resting `borderInteractive` edge — the ring
 * then reads as an increment rather than a box out of nowhere — and it was
 * declined because it hands the border back on six other screens that are
 * better without one. `design-system/02` §2.6 carries the divergence and
 * `conformance.test.ts` names this file, so the exception is visible where the
 * rule is enforced rather than hiding behind a `focus.` that is still in the
 * source.
 *
 * **The result count is a visible line, not only an announcement.** It is
 * `accessibilityLiveRegion="polite"` *and* on the page — a live region with no
 * visible text is invisible to the person typing, not only to the reader
 * behind them.
 */

import { useCallback, useEffect, useRef } from "react";
import { Text, type TextInput, View } from "react-native";
import { useT } from "../../../i18n/provider";
import { PressableScaled } from "../../../primitives/atoms/pressable-scaled/pressable-scaled";
import { SheetAwareTextInput } from "../../../primitives/sheet-input";
import { focusBorder } from "../../../theme/focus.ts";
import { inputStep, text } from "../../../theme/fonts.ts";
import { useInputHeight } from "../../../theme/input-height.ts";
import { useTheme } from "../../../theme/provider";
import { makeStyles } from "../../../theme/styles.ts";
import { radius, space, touchTarget } from "../../../tokens.ts";
import { MagnifyingGlassIcon, XIcon } from "../../icons";
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
  const inputHeight = useInputHeight("body");
  const { focused, handlers } = useInteraction();

  /**
   * True until `autoFocus` has spent its one free focus; see the header.
   *
   * **Cleared on commit, not by the first focus event.** Nothing distinguishes
   * the autofocus's own event from a person's, so consuming "the first focus"
   * is only correct when the autofocus actually lands — and RN applies
   * `autoFocus` once at mount, which is routinely lost across a navigation or
   * a modal transition. When it did not land, the flag was still set when the
   * reader's own tap arrived, that focus was swallowed, and the field stayed
   * ringless for the rest of its mounted life. React applies `autoFocus`
   * during commit, before effects, so by the time this runs the automatic
   * focus has either fired or never will.
   */
  const pendingAutoFocus = useRef(autoFocus);
  useEffect(() => {
    pendingAutoFocus.current = false;
  }, []);
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
        <MagnifyingGlassIcon size={18} color={theme.textMuted} />
        <SheetAwareTextInput
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
          style={[styles.input, inputHeight]}
        />
        {showClear ? (
          <PressableScaled
            accessibilityRole="button"
            accessibilityLabel={
              onDismiss === undefined ? t("common.clear") : t("common.closeSearch")
            }
            onPress={handleClear}
            hitSlop={CLEAR_SLOP}
            style={styles.clear}
          >
            <XIcon size={16} color={theme.textMuted} />
          </PressableScaled>
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
  // The field draws its own border, so the border is the indicator (§2.6):
  // a ring outside an edge is two edges.
  focused: focusBorder(theme.focusRing, { horizontal: space.x2 }),
  input: {
    flex: 1,
    color: theme.text,
    minHeight: touchTarget.min,
    outlineWidth: 0,
    outlineStyle: "solid",
    ...inputStep(text.ui("body")),
  },
  clear: { width: 20, height: 20, alignItems: "center", justifyContent: "center" },
  /** The ×, drawn: two bars crossed — `select.tsx`'s token cross, same construction. */
  results: { color: theme.textMuted, paddingHorizontal: space.xs, ...text.ui("caption") },
}));
