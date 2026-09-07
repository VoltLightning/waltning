/**
 * `<DetailRow>` — a labelled row inside a card: an optional icon tile, a name,
 * a second line, and either a value on the right or a chevron saying it opens.
 *
 * **The shape the design repeats most.** Settings, transaction detail, the
 * people list, subscriptions and the account register are all this row at
 * different densities. Each drew its own before, which is how one of them
 * ended up with a 44pt target and the rest did not, and why the hairline
 * between rows was three slightly different colours.
 *
 * **The separator belongs to the row, not to the caller.** A card that draws
 * its own dividers has to know which child is last; every list that did this
 * got it wrong at least once, usually by leaving a rule under the final row
 * against the card's own edge. `last` is the one thing a caller states.
 */

import type { ReactNode } from "react";
import { Pressable, Text, View } from "react-native";
import { text } from "../../../theme/fonts.ts";
import { makeStyles } from "../../../theme/styles.ts";
import { focus, radius, space, touchTarget } from "../../../tokens.ts";
import { useInteraction } from "../../interaction.ts";

export type DetailRowProps = {
  /** The row's own name — the thing a reader scans for. */
  label: string;
  /** Underneath it: what this is, or what it currently says. */
  hint?: string | undefined;
  /**
   * The figure or state on the right. Given as a node rather than a string so
   * money arrives as `<Amount>` — `design-system/04` refuses a hand-formatted
   * figure, and a row that took a `string` here would invite one.
   */
  value?: ReactNode;
  /** A 24×24 glyph. It sits in the tile this row draws, never on its own. */
  icon?: ReactNode;
  /** Opening something: draws the chevron and takes the press. */
  onPress?: (() => void) | undefined;
  /** No rule underneath — the caller states which row is its last. */
  last?: boolean;
};

export function DetailRow({ label, hint, value, icon, onPress, last }: DetailRowProps) {
  const styles = useStyles();
  const { hovered, focused, handlers } = useInteraction();
  const body = (
    <>
      {icon === undefined ? null : <View style={styles.tile}>{icon}</View>}
      <View style={styles.body}>
        <Text style={styles.label}>{label}</Text>
        {hint === undefined ? null : <Text style={styles.hint}>{hint}</Text>}
      </View>
      {value === undefined ? null : <View style={styles.value}>{value}</View>}
      {onPress === undefined ? null : <View style={styles.chevron} />}
    </>
  );
  const style = [
    styles.row,
    last === true ? null : styles.ruled,
    hovered ? styles.hovered : null,
    focused ? styles.focused : null,
  ];
  if (onPress === undefined) return <View style={style}>{body}</View>;
  return (
    <Pressable accessibilityRole="button" onPress={onPress} style={style} {...handlers}>
      {body}
    </Pressable>
  );
}

const useStyles = makeStyles((theme) => ({
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: space.xl,
    paddingVertical: space.xl,
    paddingHorizontal: space.x3,
    minHeight: touchTarget.min,
  },
  /** The hairline the card used to draw for it, and get wrong on the last row. */
  ruled: { borderBottomWidth: 1, borderBottomColor: theme.subtleFill },
  hovered: { backgroundColor: theme.hoverFill },
  /** §2.6 — every interactive element, and a row that opens a picker is one. */
  focused: {
    outlineWidth: focus.width,
    outlineColor: theme.focusRing,
    outlineOffset: -focus.offset,
  },
  tile: {
    width: 32,
    height: 32,
    borderRadius: radius.sm,
    backgroundColor: theme.accentFill,
    alignItems: "center",
    justifyContent: "center",
  },
  body: { flex: 1, gap: space.xxs },
  label: { color: theme.text, ...text.ui("bodySm", 600) },
  hint: { color: theme.textMuted, ...text.ui("caption") },
  value: { alignItems: "flex-end" },
  /**
   * Drawn, not a glyph: one rotated square with two of its borders coloured is
   * a chevron at any size, and it costs no icon. `textFaint` because it is a
   * mark — the row's own label already says what pressing it does.
   */
  chevron: {
    width: 7,
    height: 7,
    borderRightWidth: 1.5,
    borderTopWidth: 1.5,
    borderColor: theme.textFaint,
    transform: [{ rotate: "45deg" }],
  },
}));
