/**
 * `<ComposerRows>` and `<ComposerRow>` — the card of choices under the amount
 * (S05 §3): *From · Bank A · PLN*, *Category · Groceries*, each a row with a
 * tinted tile, a label over its value, and a caret saying it opens something.
 *
 * **Rows, not chips.** The chip row this replaces put seven placeholders in a
 * wrapping line, every one the same weight, so the two a capture always needs
 * were no more visible than the five it rarely does. A row has room to say
 * what it is *and* what it holds, and the deck draws exactly two of them at
 * rest — the rest wait behind `More details`, which is a row too.
 *
 * **This card opens things; it never renders them.** `AccountPicker` and
 * `CategorySheet` are sibling domains (`architecture/11`), so a row only ever
 * calls its `onPress` and the screen composes whichever sheet is open.
 */

import type { ReactNode } from "react";
import { Pressable, Text, View } from "react-native";
import { useT } from "../../../i18n/provider";
import { useInteraction } from "../../../primitives/interaction.ts";
import { CaretRightIcon } from "../../../shell/phosphor";
import { text } from "../../../theme/fonts.ts";
import { useTheme } from "../../../theme/provider";
import { makeStyles } from "../../../theme/styles.ts";
import { focus, hairline, radius, space, touchTarget } from "../../../tokens.ts";

export type ComposerRowsProps = { children: ReactNode };

export function ComposerRows({ children }: ComposerRowsProps) {
  const styles = useStyles();
  return <View style={styles.card}>{children}</View>;
}

export type ComposerRowProps = {
  /** What the row is — *From*, *Category*. */
  label: string;
  /** What it holds; absent draws `placeholder` in the muted ink instead. */
  value?: string | undefined;
  placeholder?: string | undefined;
  /** The 32 tile at the left — an icon or a letter, already tinted by the caller. S31's leg rows carry none. */
  tile?: ReactNode;
  tileFill?: string;
  /** What sits at the right instead of the caret — a balance on a transfer's leg row. */
  trailing?: ReactNode;
  onPress: () => void;
  /** Filled by a machine, not a person — P2's marker, stated in the label (never tint alone). */
  machineFilled?: boolean;
  /** A `create_transaction` refusal on this field, under the row. */
  error?: string | undefined;
  /** Every row after the first draws the hairline above itself. */
  first?: boolean;
};

export function ComposerRow({
  label,
  value,
  placeholder,
  tile,
  tileFill,
  trailing,
  onPress,
  machineFilled = false,
  error,
  first = false,
}: ComposerRowProps) {
  const t = useT();
  const theme = useTheme();
  const styles = useStyles();
  const { hovered, focused, handlers } = useInteraction();
  const fill = { backgroundColor: tileFill ?? theme.subtleFill };
  const shown = value ?? placeholder ?? "";
  // An empty row announces its placeholder too — the below-threshold category
  // suggestion lives only there, and text nobody hears is tint alone (P5).
  const accessibilityLabel =
    value === undefined
      ? placeholder === undefined || placeholder === label
        ? label
        : t("common.fieldValue", { field: label, value: placeholder })
      : machineFilled
        ? t("transactions.fieldMachineFilled", { field: label, value })
        : t("common.fieldValue", { field: label, value });

  return (
    <View style={first ? null : styles.separated}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={accessibilityLabel}
        onPress={onPress}
        {...handlers}
        style={[styles.row, hovered ? styles.hovered : null, focused ? styles.focused : null]}
      >
        {tile === undefined ? null : <View style={[styles.tile, fill]}>{tile}</View>}
        <View style={styles.words}>
          <Text style={styles.label}>
            {machineFilled ? t("transactions.fieldLabelMachineFilled", { field: label }) : label}
          </Text>
          <Text style={value === undefined ? styles.placeholder : styles.value} numberOfLines={1}>
            {shown}
          </Text>
        </View>
        {trailing === undefined ? <CaretRightIcon size={15} color={theme.textFaint} /> : trailing}
      </Pressable>
      {error === undefined ? null : <Text style={styles.error}>{error}</Text>}
    </View>
  );
}

export type ComposerTileProps = { glyph: string; ink: string };

/** A letter in the tile — the same monogram a `BrandIcon` gives an unknown payee. */
export function ComposerTileGlyph({ glyph, ink }: ComposerTileProps) {
  const styles = useStyles();
  const color = { color: ink };
  return <Text style={[styles.glyph, color]}>{glyph}</Text>;
}

const useStyles = makeStyles((theme) => ({
  card: {
    backgroundColor: theme.surface,
    borderWidth: 1,
    borderColor: theme.border,
    borderRadius: radius.md,
    overflow: "hidden",
  },
  separated: { borderTopWidth: hairline.width, borderTopColor: theme.hairline },
  // The deck's row: 14 above and below, 16 at the sides, 12 between the tile
  // and the words — 60 tall around a 32 tile.
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: space.xl,
    minHeight: touchTarget.row,
    paddingVertical: space.x2,
    paddingHorizontal: space.x3,
  },
  hovered: { backgroundColor: theme.hoverFill },
  focused: {
    outlineWidth: focus.width,
    outlineColor: theme.focusRing,
    outlineOffset: -focus.width,
  },
  tile: {
    width: 32,
    height: 32,
    borderRadius: radius.sm,
    alignItems: "center",
    justifyContent: "center",
  },
  glyph: { ...text.ui("label", 700) },
  words: { flex: 1 },
  label: { color: theme.textMuted, ...text.ui("caption") },
  value: { color: theme.text, ...text.ui("bodySm", 600) },
  placeholder: { color: theme.textMuted, ...text.ui("bodySm") },
  error: {
    color: theme.dangerText,
    ...text.ui("caption"),
    paddingHorizontal: space.x3,
    paddingBottom: space.lg,
  },
}));
