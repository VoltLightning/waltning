/**
 * `<ComposerHeader>` — the fixed top band both capture composers wear
 * (`screens/S05` §3, `S31` §3): the ✕, the screen's own name, and nothing
 * else.
 *
 * **It is a band, not a row inside the page.** `app/_layout.tsx` hides the
 * navigation header on `quick-add` and `transfer`, so this *is* the header —
 * and a header that scrolls is not one. `GroundPanel` is the page scroller
 * and clears the bottom and the sides on its own scroll content, deliberately
 * never the top ("the top belongs to the header above it"), so the screen
 * composes this **beside** the panel the way it already composes `Dock` below
 * it, and the device's top inset is cleared here, once, on a `View` that does
 * not move. Left inside the scroller the ✕ — the only way out of a composer —
 * slides under the notch the moment the column overflows, which on a phone
 * holding a hero amount, two chip rows and a keypad is the ordinary case.
 *
 * `shell.tsx`'s own `clearance` is the pattern, values and all.
 *
 * **The title is either a word or a control.** A transfer's kind cannot
 * change, so it states *Transfer*; a quick-add's can, so its kind control
 * carries the name and the change together (S05 §9.1's escape hatch,
 * top-right, out of the thumb zone). A composer never gets both.
 */

import { useCallback, useState } from "react";
import { Pressable, Text, View } from "react-native";
import Animated from "react-native-reanimated";
import { useT } from "../i18n/provider";
import { IconButton } from "../primitives/icon-button";
import { useInteraction } from "../primitives/interaction.ts";
import { usePressScale } from "../primitives/press-scale.ts";
import { useSafeArea } from "../primitives/safe-area";
import { BottomSheet } from "../shell/bottom-sheet";
import { text } from "../theme/fonts.ts";
import { makeStyles } from "../theme/styles.ts";
import { focus, radius, space, touchTarget } from "../tokens.ts";

export type ComposerKind = "expense" | "income";

export type ComposerHeaderProps = {
  /** The ✕ — every composer's own escape. Save belongs to `Dock`, Cancel does not. */
  onCancel: () => void;
  /** The screen's name, for a composer whose kind is fixed (`TransferComposer`). */
  title?: string;
  /** S05 §9.1's kind menu — the name *and* the control, where the kind is a choice. */
  kind?: ComposerKind;
  onKindChange?: (kind: ComposerKind) => void;
};

export function ComposerHeader({ onCancel, title, kind, onKindChange }: ComposerHeaderProps) {
  const t = useT();
  const styles = useStyles();
  const insets = useSafeArea();

  // Composed beside the JSX rather than in `useStyles`: `makeStyles` caches
  // per theme, and these three vary per device — `shell.tsx`'s own reason,
  // and its own values.
  const clearance = {
    paddingTop: space.x5 + insets.top,
    paddingLeft: space.x5 + insets.left,
    paddingRight: space.x5 + insets.right,
  };

  return (
    <View style={[styles.band, clearance]}>
      <IconButton label={t("common.cancel")} onPress={onCancel}>
        <CrossMark />
      </IconButton>
      {title === undefined ? null : <Text style={styles.title}>{title}</Text>}
      {kind === undefined || onKindChange === undefined ? (
        <View style={styles.spacer} />
      ) : (
        <KindControl kind={kind} onChange={onKindChange} />
      )}
    </View>
  );
}

type KindControlProps = {
  kind: ComposerKind;
  onChange: (kind: ComposerKind) => void;
};

/**
 * S05 §9.1's escape hatch, and `▾` meaning what it draws: it **opens a menu
 * listing both kinds**, rather than flipping on a tap while wearing a menu's
 * chevron. A control whose current value and whose action are the same word
 * changes the draft for anyone who taps it to read the options.
 *
 * **The menu marks the current kind**, because being read is the whole reason
 * it opens — a sheet that answers nothing the trigger had not already said is
 * a tap spent on nothing. Its rows are written here rather than taken from
 * `RadioGroup`: that component refuses a press on its own selected value, as
 * a form field should, and a menu whose marked row does nothing is a sheet
 * that will not close on the very option a thumb reaches for first.
 * `AccountPicker`'s tile is the shape instead — marked, and picking commits.
 *
 * **Transfer is not among them** (§9.1): a transfer is two accounts, two
 * amounts and a live rate, and it has its own composer, reached from
 * `FloatingAdd`'s own picker — the choice made before a draft exists.
 */
function KindControl({ kind, onChange }: KindControlProps) {
  const t = useT();
  const styles = useStyles();
  const { hovered, focused, handlers } = useInteraction();
  const press = usePressScale();
  const [open, setOpen] = useState(false);

  const label = kind === "expense" ? t("transactions.expense") : t("transactions.income");
  const handleOpen = useCallback(() => setOpen(true), []);
  const handleDismiss = useCallback(() => setOpen(false), []);
  /**
   * **Every tap closes, including the one on the kind already chosen.**
   * `RadioGroup` swallows a press on its selected option — correct for a form
   * field, where re-picking is a no-op rather than a deselection, and wrong
   * for a menu whose whole job is to answer and go: the draft's own kind is
   * the marked one, so the option a person is most likely to tap first was
   * the one that did nothing at all. `AccountPicker` states the same rule
   * for the same reason — *picking commits, there is no Use button*.
   */
  const handlePick = useCallback(
    (next: ComposerKind) => {
      setOpen(false);
      if (next !== kind) onChange(next);
    },
    [kind, onChange],
  );

  return (
    <Animated.View style={press.style}>
      <Pressable
        accessibilityRole="button"
        // The field and its value — the sheet this opens names each kind, and
        // two controls sharing one accessible name is a screen reader
        // announcing the same thing twice.
        accessibilityLabel={t("transactions.kindValue", { kind: label })}
        onPress={handleOpen}
        onPressIn={press.onPressIn}
        onPressOut={press.onPressOut}
        {...handlers}
        style={[
          styles.kindControl,
          hovered ? styles.kindControlHovered : null,
          focused ? styles.focused : null,
        ]}
      >
        <Text style={styles.kindControlLabel}>{label}</Text>
        <View style={styles.kindControlChevron} />
      </Pressable>
      <BottomSheet visible={open} title={t("transactions.kind")} onDismiss={handleDismiss}>
        {/*
          The group takes no name of its own: `BottomSheet`'s own title
          already says *Kind*, and a second identical label announces the
          word twice on a sheet holding two rows.
        */}
        <View accessibilityRole="radiogroup" style={styles.kindOptions}>
          <KindOption
            kind="expense"
            label={t("transactions.expense")}
            selected={kind === "expense"}
            onPick={handlePick}
          />
          <KindOption
            kind="income"
            label={t("transactions.income")}
            selected={kind === "income"}
            onPick={handlePick}
          />
        </View>
      </BottomSheet>
    </Animated.View>
  );
}

type KindOptionProps = {
  kind: ComposerKind;
  label: string;
  selected: boolean;
  onPick: (kind: ComposerKind) => void;
};

/**
 * One row of the kind menu — `role="radio"` inside the group, marked when it
 * is the draft's own kind, and **always** answering the tap.
 * `AccountPicker`'s own tile, in miniature.
 */
function KindOption({ kind, label, selected, onPick }: KindOptionProps) {
  const styles = useStyles();
  const { hovered, focused, handlers } = useInteraction();
  const press = usePressScale();
  const handlePress = useCallback(() => onPick(kind), [kind, onPick]);

  return (
    <Animated.View style={press.style}>
      <Pressable
        accessibilityRole="radio"
        accessibilityLabel={label}
        accessibilityState={{ checked: selected }}
        aria-checked={selected}
        onPress={handlePress}
        onPressIn={press.onPressIn}
        onPressOut={press.onPressOut}
        {...handlers}
        style={[
          styles.kindOption,
          selected ? styles.kindOptionSelected : null,
          hovered && !selected ? styles.kindOptionHovered : null,
          focused ? styles.focused : null,
        ]}
      >
        <Text style={[styles.kindOptionLabel, selected ? styles.kindOptionLabelSelected : null]}>
          {label}
        </Text>
        {selected ? <View style={styles.check} /> : null}
      </Pressable>
    </Animated.View>
  );
}

/** The drawn ✕ — a literal glyph would be the one icon depending on a font shipping it (`keypad.tsx`'s own rule). */
function CrossMark() {
  const styles = useStyles();
  return (
    <View style={styles.crossMark}>
      <View style={[styles.crossMarkBar, styles.crossMarkBarA]} />
      <View style={[styles.crossMarkBar, styles.crossMarkBarB]} />
    </View>
  );
}

const useStyles = makeStyles((theme) => ({
  band: {
    backgroundColor: theme.ground,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: space.x3,
    paddingBottom: space.x3,
  },
  title: { color: theme.text, ...text.ui("displayThree") },
  /** Balances the ✕ so a title stays centred; the kind control takes this slot otherwise. */
  spacer: { width: touchTarget.min },
  kindControl: {
    flexDirection: "row",
    alignItems: "center",
    gap: space.sm,
    minHeight: touchTarget.min,
    paddingHorizontal: space.x2,
    borderRadius: radius.sm,
  },
  kindControlHovered: { backgroundColor: theme.hoverFill },
  kindOptions: { gap: space.md },
  kindOption: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    minHeight: touchTarget.min,
    paddingHorizontal: space.x3,
    borderWidth: 1,
    borderColor: theme.border,
    borderRadius: radius.sm,
    backgroundColor: theme.surface,
  },
  kindOptionHovered: { backgroundColor: theme.hoverFill },
  kindOptionSelected: { borderWidth: 2, borderColor: theme.accent },
  kindOptionLabel: { color: theme.text, ...text.ui("body") },
  kindOptionLabelSelected: { color: theme.accentText, ...text.ui("body", 600) },
  /** `AccountPicker`'s own drawn check, matched — never a font glyph. */
  check: {
    width: 11,
    height: 6,
    borderLeftWidth: 2,
    borderBottomWidth: 2,
    borderColor: theme.accentText,
    transform: [{ rotate: "-45deg" }],
  },
  kindControlLabel: { color: theme.text, ...text.ui("body", 600) },
  kindControlChevron: {
    width: 8,
    height: 8,
    borderRightWidth: 1.5,
    borderBottomWidth: 1.5,
    borderColor: theme.textMuted,
    transform: [{ rotate: "45deg" }],
    marginTop: -4,
  },
  focused: {
    outlineWidth: focus.width,
    outlineColor: theme.focusRing,
    outlineOffset: focus.offset,
  },
  crossMark: { width: 16, height: 16, alignItems: "center", justifyContent: "center" },
  crossMarkBar: { position: "absolute", width: 17, height: 2, backgroundColor: theme.text },
  crossMarkBarA: { transform: [{ rotate: "45deg" }] },
  crossMarkBarB: { transform: [{ rotate: "-45deg" }] },
}));
