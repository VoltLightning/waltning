/**
 * `<Select>` and `<MultiSelect>` — `design-system/03` §3.8. A choice folded
 * away until asked for.
 *
 * A select is a radio group (or checkbox set) whose options are not worth the
 * screen they would occupy — many, long, or rarely changed. If all options
 * should be read before choosing, use `RadioGroup`; if the choice is a filter
 * over a partition, `SegmentControl`.
 *
 * **Disclosure, not an overlay.** The options unfold in place, in the form's
 * own flow. An overlay needs a portal and a scrim — that machinery exists in
 * `shell/bottom-sheet`, which a *screen* may compose around any of these
 * controls; a primitive that reached for the shell would invert the foundation
 * (`tests/module-boundaries`). Unfolding costs a layout shift and buys a
 * control with no dependencies and no z-index to lose.
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
 * **The panel scrolls; it does not grow without bound.** Its height is capped
 * at six and a half rows — the half row is the signal that there is more, the
 * way a list edge does it everywhere else. `searchable` adds a filter row for
 * the lists where scrolling is not enough (52 accounts, S16's own number);
 * the query clears on close, because a filter that survives a closed panel is
 * an invisible reason the list looks short next time.
 */

import { useCallback, useEffect, useRef, useState } from "react";
import { Animated, Pressable, ScrollView, Text, TextInput, View } from "react-native";
import { useT } from "../i18n/provider";
import { text } from "../theme/fonts.ts";
import { useTheme } from "../theme/provider";
import { makeStyles } from "../theme/styles.ts";
import { focus, motion, radius, space, touchTarget } from "../tokens.ts";
import { easing } from "./easing.ts";
import { useInteraction } from "./interaction.ts";
import { useReducedMotion } from "./reduced-motion.ts";

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

  // The field restates the collection in the options' own order — the labels
  // joined, not a count (see the header).
  const display = options
    .filter((option) => values.includes(option.value))
    .map((option) => option.label)
    .join(" · ");

  const shown = filterOptions(options, searchable ? query : "");

  return (
    <Disclosure
      label={label}
      placeholder={placeholder}
      display={display === "" ? undefined : display}
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
  const reduced = useReducedMotion();

  const turn = useRef(new Animated.Value(0)).current;
  const reveal = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.timing(turn, {
      toValue: open ? 1 : 0,
      duration: reduced ? motion.none.duration : motion.move.duration,
      easing: easing.move,
      useNativeDriver: true,
    }).start();
    if (open) {
      reveal.setValue(0);
      Animated.timing(reveal, {
        toValue: 1,
        duration: reduced ? motion.none.duration : motion.fast.duration,
        easing: easing.fast,
        useNativeDriver: true,
      }).start();
    }
  }, [open, reduced, reveal, turn]);

  const toggleOpen = useCallback(() => onOpenChange(!open), [onOpenChange, open]);

  const rotate = turn.interpolate({ inputRange: [0, 1], outputRange: ["0deg", "180deg"] });
  const filled = display !== undefined;

  return (
    <View style={styles.root}>
      <Text style={styles.label}>{label}</Text>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={
          filled ? t("common.fieldValue", { field: label, value: display }) : label
        }
        accessibilityState={{ expanded: open, disabled }}
        disabled={disabled}
        onPress={toggleOpen}
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
        <Animated.View style={[styles.chevron, { transform: [{ rotate }] }]}>
          <View style={styles.chevronMark} />
        </Animated.View>
      </Pressable>
      {open ? (
        <Animated.View style={[styles.panel, { opacity: reveal }]}>
          {search === undefined ? null : (
            <SearchRow query={search.query} onQueryChange={search.onQueryChange} />
          )}
          {/* Capped, and the cap is deliberately six and a half rows: the half
              row is the signal that there is more, the way a list edge says it
              everywhere else. `maxHeight` is a bound, not an animation — the
              §2.7 ban is on height *moving*. */}
          <ScrollView style={styles.panelScroll}>{panel}</ScrollView>
        </Animated.View>
      ) : null}
    </View>
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
  panel: {
    borderWidth: 1,
    borderColor: theme.border,
    borderRadius: radius.sm,
    backgroundColor: theme.surface,
    paddingVertical: space.xs,
  },
  panelScroll: { maxHeight: touchTarget.min * 6.5 },
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
