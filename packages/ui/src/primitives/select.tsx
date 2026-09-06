/**
 * `<Select>` and `<MultiSelect>` — `design-system/03` §3.8. A choice folded
 * away until asked for.
 *
 * A select is a radio group (or checkbox set) whose options are not worth the
 * screen they would occupy — many, long, or rarely changed. If all options
 * should be read before choosing, use `RadioGroup`; if the choice is a filter
 * over a partition, `SegmentControl`.
 *
 * **The panel is an overlay, and it is the page that must not move.** The
 * options are drawn above the form, anchored under the field they belong to,
 * because a panel laid out *in* the flow pushes the page down as it opens:
 * disclosing "Rate source" on Currencies moved Edit, Archive and the next
 * currency by some 200px and moved them back on close, which loses the
 * reader's place on the one interaction whose whole job is to answer a
 * question about the row in front of them.
 *
 * **A `Modal`, not a portal library and not a `z-index`.** React Native gives
 * exactly one way out of the layout tree that behaves the same on iOS,
 * Android and the web, and an absolutely-positioned panel is not it: on
 * Android a child drawn outside its parent's bounds stops receiving touches,
 * so the last field on a form would open a list nobody could tap. The
 * geometry — under the field, flipped above it when below is the smaller
 * room, never off the window — is `anchor.ts`, tested as arithmetic. The
 * shell's own `BottomSheet` is still off limits: a primitive that reached
 * for the shell would invert the foundation (`tests/module-boundaries`), and
 * `Modal` is `react-native`'s, not the shell's.
 *
 * **The chevron turns; the panel fades.** Rotation is the state made visible
 * (`motion.move` — a visible thing moving); the panel arrives at `motion.fast`
 * as an opacity, never a height — §2.7 bans layout properties from animating,
 * so the panel *is* there at once and only its ink fades in.
 *
 * **The two differ in one promise.** `Select` closes on choice — picking is
 * answering. `MultiSelect` stays open — picking is collecting, and the field
 * above restates the collection as it grows. Neither invents a summary such as
 * "3 selected": that is a plural, the catalogue holds none yet, and a wrong
 * Polish plural reads as ordinary text to anyone who does not speak it — the
 * labels themselves, joined, say more anyway.
 *
 * **A pick is undone where it shows.** `MultiSelect`'s field holds its
 * choices as removable tokens — the × takes one out with the panel closed,
 * because a person deciding against something should not have to reopen the
 * list it came from. That is also why its field is built differently from
 * `Select`'s: a token is a button, and a button inside the field-wide
 * Pressable would be a control inside a control — an axe violation
 * (`nested-interactive`) and a screen-reader trap. So the single select keeps
 * the whole-field target, and the multi's field is a row of tokens beside a
 * toggle that owns the rest of the width.
 *
 * **The panel scrolls; it does not grow without bound.** Its height is capped
 * at six and a half rows — the half row is the signal that there is more, the
 * way a list edge does it everywhere else — and narrowed again to whatever
 * room the window actually leaves on the side it opened. `searchable` adds a filter row for
 * the lists where scrolling is not enough (52 accounts, S16's own number);
 * the query clears on close, because a filter that survives a closed panel is
 * an invisible reason the list looks short next time.
 */

import { useCallback, useEffect, useState } from "react";
import type { ViewStyle } from "react-native";
import {
  Modal,
  Pressable,
  ScrollView,
  Text,
  TextInput,
  useWindowDimensions,
  View,
} from "react-native";
import Animated, { type AnimatedStyle } from "react-native-reanimated";
import { useT } from "../i18n/provider";
import { text } from "../theme/fonts.ts";
import { useTheme } from "../theme/provider";
import { makeStyles } from "../theme/styles.ts";
import { focus, radius, space, touchTarget } from "../tokens.ts";
import { type Anchor, panelPlacement, unanchoredPlacement, useAnchor } from "./anchor.ts";
import { useDisclosureMotion } from "./disclosure-motion.ts";
import { useInteraction } from "./interaction.ts";
import { useWindowInsets } from "./safe-area";

/** Six and a half rows — the half row is the signal that there is more. */
const PANEL_CAP = touchTarget.min * 6.5;

export type SelectOption = {
  value: string;
  label: string;
  disabled?: boolean;
};

export type SelectProps = {
  /** Visible above the field and announced as its name. */
  label: string;
  /** Shown in the field while nothing is chosen. */
  placeholder: string;
  options: readonly SelectOption[];
  /** `null` before the first pick — a default is the caller's decision. */
  value: string | null;
  onChange: (value: string) => void;
  /** A filter row above the options — for the lists scrolling cannot carry. */
  searchable?: boolean;
  /** Start disclosed. For a screen whose whole point is this choice. */
  defaultOpen?: boolean;
  disabled?: boolean;
};

export function Select({
  label,
  placeholder,
  options,
  value,
  onChange,
  searchable = false,
  defaultOpen = false,
  disabled,
}: SelectProps) {
  const [open, setOpen] = useState(defaultOpen);
  const [query, setQuery] = useState("");
  const selected = options.find((option) => option.value === value);

  // The query dies with the panel — a filter that survives a closed panel is
  // an invisible reason the list looks short next time.
  const handleOpenChange = useCallback((next: boolean) => {
    setOpen(next);
    if (!next) setQuery("");
  }, []);

  // Picking is answering, so the panel folds on choice.
  const handlePick = useCallback(
    (next: string) => {
      onChange(next);
      setOpen(false);
      setQuery("");
    },
    [onChange],
  );

  const shown = filterOptions(options, searchable ? query : "");

  return (
    <Disclosure
      label={label}
      placeholder={placeholder}
      display={selected?.label}
      disabled={disabled === true}
      open={open}
      onOpenChange={handleOpenChange}
      search={searchable ? { query, onQueryChange: setQuery } : undefined}
      panel={
        shown.length === 0 ? (
          <NoMatches />
        ) : (
          <SelectRows options={shown} value={value} onPick={handlePick} />
        )
      }
    />
  );
}

export type MultiSelectProps = {
  label: string;
  placeholder: string;
  options: readonly SelectOption[];
  values: readonly string[];
  onChange: (values: readonly string[]) => void;
  /** A filter row above the options — for the lists scrolling cannot carry. */
  searchable?: boolean;
  /** Start disclosed. For a screen whose whole point is this collection. */
  defaultOpen?: boolean;
  disabled?: boolean;
};

export function MultiSelect({
  label,
  placeholder,
  options,
  values,
  onChange,
  searchable = false,
  defaultOpen = false,
  disabled,
}: MultiSelectProps) {
  const [open, setOpen] = useState(defaultOpen);
  const [query, setQuery] = useState("");

  const handleOpenChange = useCallback((next: boolean) => {
    setOpen(next);
    if (!next) setQuery("");
  }, []);

  const shown = filterOptions(options, searchable ? query : "");
  const chosen = options.filter((option) => values.includes(option.value));

  const handleRemove = useCallback(
    (value: string) => onChange(values.filter((existing) => existing !== value)),
    [onChange, values],
  );

  return (
    <MultiSelectField
      label={label}
      placeholder={placeholder}
      chosen={chosen}
      onRemove={handleRemove}
      disabled={disabled === true}
      open={open}
      onOpenChange={handleOpenChange}
      search={searchable ? { query, onQueryChange: setQuery } : undefined}
      panel={
        shown.length === 0 ? (
          <NoMatches />
        ) : (
          <MultiSelectRows options={shown} values={values} onChange={onChange} />
        )
      }
    />
  );
}

/**
 * Case-blind substring on the label — the person is matching what they *see*.
 * Value matching would find "PLN" behind "Polish Złoty" and read as haunted.
 */
function filterOptions(options: readonly SelectOption[], query: string): readonly SelectOption[] {
  const needle = query.trim().toLowerCase();
  if (needle === "") return options;
  return options.filter((option) => option.label.toLowerCase().includes(needle));
}

/* ── The shared disclosure shell ─────────────────────────────────────────── */

type DisclosureProps = {
  label: string;
  placeholder: string;
  /** What the closed field shows; `undefined` shows the placeholder. */
  display: string | undefined;
  disabled: boolean;
  /** Owned by the caller: `Select` must close it on a pick, so it holds it. */
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Present = render the filter row. The caller owns the query. */
  search?: { query: string; onQueryChange: (query: string) => void } | undefined;
  panel: React.ReactNode;
};

function Disclosure({
  label,
  placeholder,
  display,
  disabled,
  open,
  onOpenChange,
  search,
  panel,
}: DisclosureProps) {
  const t = useT();
  const styles = useStyles();
  const { hovered, focused, handlers } = useInteraction();
  const { chevron, panel: panelStyle } = useDisclosureMotion(open);
  const { ref, anchor, measure } = useAnchor();

  const toggleOpen = useCallback(() => onOpenChange(!open), [onOpenChange, open]);
  const close = useCallback(() => onOpenChange(false), [onOpenChange]);
  const remeasure = useMeasureWhileOpen(open, measure);
  const filled = display !== undefined;

  return (
    <View style={styles.root}>
      <Text style={styles.label}>{label}</Text>
      <Pressable
        ref={ref}
        accessibilityRole="button"
        accessibilityLabel={
          filled ? t("common.fieldValue", { field: label, value: display }) : label
        }
        accessibilityState={{ expanded: open, disabled }}
        disabled={disabled}
        onPress={toggleOpen}
        onLayout={remeasure}
        {...handlers}
        style={[
          styles.field,
          hovered && !disabled && !focused ? styles.fieldHovered : null,
          open ? styles.fieldOpen : null,
          focused ? styles.focused : null,
          disabled ? styles.disabled : null,
        ]}
      >
        <Text numberOfLines={1} style={[styles.value, filled ? null : styles.valuePlaceholder]}>
          {filled ? display : placeholder}
        </Text>
        <Animated.View style={[styles.chevron, chevron]}>
          <View style={styles.chevronMark} />
        </Animated.View>
      </Pressable>
      <PanelOverlay
        open={open}
        onDismiss={close}
        label={label}
        anchor={anchor}
        reveal={panelStyle}
        search={search}
      >
        {panel}
      </PanelOverlay>
    </View>
  );
}

/**
 * Re-measure the field on open, and on any layout change *while* open.
 *
 * Never while closed: `measureInWindow` answers on a later tick, and a
 * control nobody has opened has nothing to do with the answer — measuring it
 * anyway would set state for every `Select` on a form the moment it lays out.
 */
function useMeasureWhileOpen(open: boolean, measure: () => void): () => void {
  useEffect(() => {
    if (open) measure();
  }, [open, measure]);
  return useCallback(() => {
    if (open) measure();
  }, [open, measure]);
}

type PanelOverlayProps = {
  open: boolean;
  onDismiss: () => void;
  /** The field's own name — see the component's note on the `dialog` role. */
  label: string;
  /** `null` until the field has reported itself — one tick, and every test. */
  anchor: Anchor | null;
  reveal: AnimatedStyle<ViewStyle>;
  search: { query: string; onQueryChange: (query: string) => void } | undefined;
  children: React.ReactNode;
};

/**
 * The options, above the page rather than in it.
 *
 * The backdrop is transparent and unmissable at once: a select is not a
 * dialog, so it earns no scrim, but a `Modal` covers the window and something
 * has to take the tap that means *never mind*. Escape does the same through
 * `onRequestClose`.
 *
 * **The role is the `Modal`'s price, and the panel pays it by name.**
 * `react-native-web` renders a modal as `role="dialog"` with `aria-modal`,
 * so a screen reader announces a dialog whatever this component believes
 * about scrims — an *unnamed* dialog, if nothing says otherwise. The panel
 * therefore carries the field's own label, so what is announced is "Currency,
 * dialog" rather than "dialog". `03-primitives` §3.8 records the same trade.
 *
 * **Invisible until measured, never mispositioned.** The field answers
 * `measureInWindow` a tick *after* a paint — `react-native-web`'s
 * implementation is a `setTimeout` — so a visible first frame at
 * `unanchoredPlacement`'s fallback is not hypothetical. The transparency sits
 * on the overlay rather than on the panel because the panel's own opacity is
 * animated: Reanimated writes the animated value straight onto the view after
 * the commit, so a static `opacity: 0` in the same style array is overwritten
 * on the first animation frame. A parent's opacity is not. The content is
 * mounted throughout — a screen reader, and a test, meet the options
 * immediately either way.
 */
function PanelOverlay({
  open,
  onDismiss,
  label,
  anchor,
  reveal,
  search,
  children,
}: PanelOverlayProps) {
  const t = useT();
  const styles = useStyles();
  // The window's own, not the layer's: the panel is a `Modal` over the whole
  // window, and `bottom-sheet.tsx` states the argument beside its own read.
  const insets = useWindowInsets();
  const frame = useWindowDimensions();

  if (!open) return null;

  // A per-render position, like `FloatingAdd`'s dock frame: computed beside
  // the JSX rather than in `useStyles`, whose cache is keyed on the theme.
  const placement =
    anchor === null
      ? unanchoredPlacement(frame, insets, PANEL_CAP)
      : panelPlacement(anchor, frame, insets, PANEL_CAP);

  return (
    // `statusBarTranslucent`/`navigationBarTranslucent` — under Android's
    // edge-to-edge the app window includes the system bars but a `Modal`'s
    // window does not, so `measureInWindow`'s coordinates would be read in a
    // window whose origin is a status bar lower and the panel would sit
    // 24–48px below its own field. iOS and the web ignore both props.
    <Modal
      // The field's own name, on the element that carries the role.
      // `react-native-web` spreads a modal's props onto the `dialog` it
      // renders; on the panel two levels in, this named a generic `div` and
      // the dialog stayed anonymous — which is the announcement §3.8's
      // sentence is about.
      accessibilityLabel={label}
      transparent
      visible
      onRequestClose={onDismiss}
      animationType="none"
      statusBarTranslucent
      navigationBarTranslucent
    >
      <View style={[styles.overlay, anchor === null ? styles.overlayUnmeasured : null]}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={t("common.dismissOptions")}
          onPress={onDismiss}
          style={styles.backdrop}
        />
        <Animated.View style={[styles.panel, placement, reveal]}>
          {search === undefined ? null : (
            <SearchRow query={search.query} onQueryChange={search.onQueryChange} />
          )}
          {/* `nestedScrollEnabled` belongs on the *inner* scroller — it makes
              the view it is set on a nested-scrolling child, which is what
              lets this list take the gesture instead of an outer scroller
              on Android. */}
          <ScrollView style={styles.panelScroll} nestedScrollEnabled>
            {children}
          </ScrollView>
        </Animated.View>
      </View>
    </Modal>
  );
}

/* ── The multi-select's field: tokens beside a toggle ────────────────────── */

type MultiSelectFieldProps = {
  label: string;
  placeholder: string;
  chosen: readonly SelectOption[];
  onRemove: (value: string) => void;
  disabled: boolean;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  search: { query: string; onQueryChange: (query: string) => void } | undefined;
  panel: React.ReactNode;
};

/**
 * The container is a `View`, not a Pressable — each token is a button, and a
 * button inside a button is `nested-interactive`. The toggle owns all the
 * width the tokens leave, so tapping anywhere that is not a token still
 * discloses, and an empty field is one whole-width target like `Select`'s.
 */
function MultiSelectField({
  label,
  placeholder,
  chosen,
  onRemove,
  disabled,
  open,
  onOpenChange,
  search,
  panel,
}: MultiSelectFieldProps) {
  const styles = useStyles();
  const { chevron, panel: panelStyle } = useDisclosureMotion(open);
  const { hovered, focused, handlers } = useInteraction();
  const { ref, anchor, measure } = useAnchor();

  const toggleOpen = useCallback(() => onOpenChange(!open), [onOpenChange, open]);
  const close = useCallback(() => onOpenChange(false), [onOpenChange]);
  const remeasure = useMeasureWhileOpen(open, measure);
  const empty = chosen.length === 0;

  return (
    <View style={styles.root}>
      <Text style={styles.label}>{label}</Text>
      <View
        ref={ref}
        onLayout={remeasure}
        style={[
          styles.field,
          styles.tokenField,
          open ? styles.fieldOpen : null,
          disabled ? styles.disabled : null,
        ]}
      >
        {chosen.map((option) => (
          <Token key={option.value} option={option} disabled={disabled} onRemove={onRemove} />
        ))}
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={label}
          accessibilityState={{ expanded: open, disabled }}
          disabled={disabled}
          onPress={toggleOpen}
          hitSlop={space.xs}
          {...handlers}
          style={[
            styles.tokenToggle,
            hovered && !disabled && !focused ? styles.tokenToggleHovered : null,
            focused ? styles.focused : null,
          ]}
        >
          {empty ? (
            <Text numberOfLines={1} style={[styles.value, styles.valuePlaceholder]}>
              {placeholder}
            </Text>
          ) : null}
          <Animated.View style={[styles.chevron, chevron]}>
            <View style={styles.chevronMark} />
          </Animated.View>
        </Pressable>
      </View>
      <PanelOverlay
        open={open}
        onDismiss={close}
        label={label}
        anchor={anchor}
        reveal={panelStyle}
        search={search}
      >
        {panel}
      </PanelOverlay>
    </View>
  );
}

type TokenProps = {
  option: SelectOption;
  disabled: boolean;
  onRemove: (value: string) => void;
};

/**
 * One chosen thing, undone where it shows. The whole token is the remove
 * target — an ×-only target would be a 10px button wearing a 44px costume —
 * and its accessible name says the verb, because "Polish Złoty, button" does
 * not warn that pressing deletes.
 */
function Token({ option, disabled, onRemove }: TokenProps) {
  const t = useT();
  const styles = useStyles();
  const { hovered, focused, handlers } = useInteraction();
  const handleRemove = useCallback(() => onRemove(option.value), [onRemove, option.value]);

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={t("common.remove", { value: option.label })}
      accessibilityState={{ disabled }}
      disabled={disabled}
      onPress={handleRemove}
      // Drawn at 36 so the tokens sit inside a 44 field without inflating it;
      // the §10 floor is the *target*, and hitSlop restores it (§2.4).
      hitSlop={space.xs}
      {...handlers}
      style={[
        styles.token,
        hovered && !disabled ? styles.tokenHovered : null,
        focused ? styles.focused : null,
      ]}
    >
      <Text style={styles.tokenLabel}>{option.label}</Text>
      <View style={styles.tokenCross}>
        <View style={[styles.tokenCrossBar, styles.tokenCrossBarA]} />
        <View style={[styles.tokenCrossBar, styles.tokenCrossBarB]} />
      </View>
    </Pressable>
  );
}

/* ── The filter row and its empty answer ─────────────────────────────────── */

type SearchRowProps = { query: string; onQueryChange: (query: string) => void };

function SearchRow({ query, onQueryChange }: SearchRowProps) {
  const t = useT();
  const styles = useStyles();
  const theme = useTheme();
  const { focused, handlers } = useInteraction();

  return (
    <TextInput
      accessibilityLabel={t("common.search")}
      value={query}
      onChangeText={onQueryChange}
      placeholder={t("common.search")}
      placeholderTextColor={theme.textMuted}
      // The keyboard opens on the tap that focuses it, not on disclosure —
      // auto-focusing here would cover half the options with a keyboard the
      // moment the panel arrives.
      style={[styles.search, focused ? styles.focused : null]}
      onFocus={handlers.onFocus}
      onBlur={handlers.onBlur}
    />
  );
}

/** A filter that matched nothing says so — an empty panel reads as broken. */
function NoMatches() {
  const t = useT();
  const styles = useStyles();
  return (
    <View style={styles.noMatches}>
      <Text style={styles.noMatchesText}>{t("common.noMatches")}</Text>
    </View>
  );
}

/* ── Option rows ─────────────────────────────────────────────────────────── */

type SelectRowsProps = {
  options: readonly SelectOption[];
  value: string | null;
  onPick: (value: string) => void;
};

function SelectRows({ options, value, onPick }: SelectRowsProps) {
  return (
    <>
      {options.map((option) => (
        <OptionRow
          key={option.value}
          option={option}
          selected={option.value === value}
          role="radio"
          onSelect={onPick}
        />
      ))}
    </>
  );
}

type MultiSelectRowsProps = {
  options: readonly SelectOption[];
  values: readonly string[];
  onChange: (values: readonly string[]) => void;
};

function MultiSelectRows({ options, values, onChange }: MultiSelectRowsProps) {
  const toggle = useCallback(
    (value: string) => {
      onChange(
        values.includes(value)
          ? values.filter((existing) => existing !== value)
          : [...values, value],
      );
    },
    [onChange, values],
  );

  return (
    <>
      {options.map((option) => (
        <OptionRow
          key={option.value}
          option={option}
          selected={values.includes(option.value)}
          role="checkbox"
          onSelect={toggle}
        />
      ))}
    </>
  );
}

type OptionRowProps = {
  option: SelectOption;
  selected: boolean;
  role: "radio" | "checkbox";
  onSelect: (value: string) => void;
};

function OptionRow({ option, selected, role, onSelect }: OptionRowProps) {
  const styles = useStyles();
  const { hovered, focused, handlers } = useInteraction();
  const disabled = option.disabled === true;

  const handlePress = useCallback(() => onSelect(option.value), [onSelect, option.value]);

  return (
    <Pressable
      accessibilityRole={role}
      accessibilityLabel={option.label}
      // `checked` for both: a radio's ARIA state is `aria-checked` too. The
      // ARIA prop repeats it because react-native-web drops `checked` from a
      // Pressable's accessibilityState (see chip.tsx).
      accessibilityState={{ checked: selected, disabled }}
      aria-checked={selected}
      disabled={disabled}
      onPress={handlePress}
      {...handlers}
      style={[
        styles.option,
        hovered && !disabled ? styles.optionHovered : null,
        selected ? styles.optionSelected : null,
        focused ? styles.focused : null,
        disabled ? styles.disabled : null,
      ]}
    >
      <Text style={[styles.optionLabel, selected ? styles.optionLabelSelected : null]}>
        {option.label}
      </Text>
      {/* The mark stays while selected — in a multi panel several stay lit. */}
      {selected ? <View style={styles.check} /> : null}
    </Pressable>
  );
}

const useStyles = makeStyles((theme) => ({
  root: { gap: space.sm },
  label: { color: theme.textMuted, ...text.ui("kicker") },
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
  fieldHovered: { borderColor: theme.borderStrong },
  fieldOpen: { borderColor: theme.borderStrong },
  focused: {
    outlineWidth: focus.width,
    outlineColor: theme.focusRing,
    outlineOffset: focus.offset,
  },
  disabled: { opacity: 0.45 },
  value: { flex: 1, color: theme.text, ...text.ui("body") },
  valuePlaceholder: { color: theme.textMuted },
  chevron: { width: 16, height: 16, alignItems: "center", justifyContent: "center" },
  /** Two borders rotated 45°: a chevron in every face and theme. */
  chevronMark: {
    width: 9,
    height: 9,
    borderRightWidth: 1.5,
    borderBottomWidth: 1.5,
    borderColor: theme.textMuted,
    transform: [{ rotate: "45deg" }],
    marginTop: -4,
  },
  /** The `Modal`'s own frame — the panel positions itself absolutely inside it. */
  overlay: { flex: 1 },
  /**
   * Transparent, and that is the point: a select is not a dialog and earns no
   * scrim, but a `Modal` covers the window and a tap outside the panel has to
   * mean *never mind* rather than nothing.
   */
  backdrop: { position: "absolute", top: 0, right: 0, bottom: 0, left: 0 },
  panel: {
    borderWidth: 1,
    borderColor: theme.border,
    borderRadius: radius.sm,
    backgroundColor: theme.surface,
    paddingVertical: space.xs,
    shadowColor: theme.elevation.raised.shadowColor,
    shadowOpacity: theme.elevation.raised.shadowOpacity,
    shadowRadius: theme.elevation.raised.shadowRadius,
    shadowOffset: theme.elevation.raised.shadowOffset,
  },
  /**
   * One frame at most, and never a visible one — on the overlay rather than
   * the panel, whose own opacity is animated and would overwrite it.
   */
  overlayUnmeasured: { opacity: 0 },
  /** The cap is the panel's; this only has to give way inside it. */
  panelScroll: { flexShrink: 1 },
  /** The token field wraps and pads itself; the toggle inside carries the 44. */
  tokenField: {
    flexWrap: "wrap",
    paddingVertical: space.xs,
    paddingLeft: space.xs,
    paddingRight: 0,
    gap: space.xs,
  },
  tokenToggle: {
    flexGrow: 1,
    minHeight: touchTarget.min - space.md,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "flex-end",
    gap: space.md,
    paddingHorizontal: space.md,
    borderRadius: radius.sm,
  },
  tokenToggleHovered: { backgroundColor: theme.hoverFill },
  token: {
    minHeight: touchTarget.min - space.md,
    flexDirection: "row",
    alignItems: "center",
    gap: space.md,
    paddingHorizontal: space.xl,
    borderRadius: radius.sm,
    borderWidth: 1,
    borderColor: theme.accentFillBorder,
    backgroundColor: theme.accentFill,
  },
  tokenHovered: { backgroundColor: theme.hoverFill },
  tokenLabel: { color: theme.accentText, ...text.ui("bodySm", 600) },
  /** The ×, drawn: two bars crossed, in the token's own ink. */
  tokenCross: { width: 10, height: 10, alignItems: "center", justifyContent: "center" },
  tokenCrossBar: {
    position: "absolute",
    width: 11,
    height: 1.5,
    backgroundColor: theme.accentText,
  },
  tokenCrossBarA: { transform: [{ rotate: "45deg" }] },
  tokenCrossBarB: { transform: [{ rotate: "-45deg" }] },
  search: {
    minHeight: touchTarget.min,
    marginHorizontal: space.xs,
    paddingHorizontal: space.x2,
    borderBottomWidth: 1,
    borderBottomColor: theme.hairline,
    color: theme.text,
    ...text.ui("body"),
  },
  noMatches: { minHeight: touchTarget.min, justifyContent: "center", paddingHorizontal: space.x2 },
  noMatchesText: { color: theme.textMuted, ...text.ui("caption") },
  option: {
    minHeight: touchTarget.min,
    flexDirection: "row",
    alignItems: "center",
    gap: space.md,
    paddingHorizontal: space.x2,
  },
  optionHovered: { backgroundColor: theme.hoverFill },
  optionSelected: { backgroundColor: theme.accentFill },
  optionLabel: { flex: 1, color: theme.text, ...text.ui("body") },
  optionLabelSelected: { color: theme.accentText, ...text.ui("body", 600) },
  /** The drawn check, in the accent's text because it sits on `accentFill`. */
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
