/**
 * `<SettingsMenu>` — the Settings tab's own list: one row per destination,
 * label left, chevron right, all of them in one card.
 *
 * **A card groups rows.** The menu was three `Button`s stacked inside a
 * titled card, which is the shape `design-system/05` §5.1 reserves for a
 * card that holds *one* action or a hero figure. Four destinations are a
 * list, and a list of destinations is exactly what a card of grouped rows is
 * for — the same anatomy `BalanceRow` gives the register, minus the figure.
 *
 * **No title.** The tab shell draws the screen's name above the ground, so a
 * title inside the card would be the same word twice on one screen. That is
 * also why this component takes no `title` prop: there is no correct value
 * for it here, and an optional one would invite the duplicate back.
 *
 * **The chevron is drawn, not typed.** A glyph would depend on the face
 * shipping it — the same reason `CurrencyGrid`'s check mark is two borders
 * on a `View` rather than `✓`.
 */

import { useCallback } from "react";
import { Pressable, Text, View } from "react-native";
import { useInteraction } from "../primitives/interaction.ts";
import { Card } from "../shell/card";
import { text } from "../theme/fonts.ts";
import { makeStyles } from "../theme/styles.ts";
import { focus, hairline, space, touchTarget } from "../tokens.ts";

export type SettingsMenuItem = {
  /** Handed back to `onSelect` — the screen owns what it means (a route, here). */
  id: string;
  label: string;
};

export type SettingsMenuProps = {
  items: readonly SettingsMenuItem[];
  onSelect: (id: string) => void;
};

export function SettingsMenu({ items, onSelect }: SettingsMenuProps) {
  const styles = useStyles();

  return (
    <Card>
      <View style={styles.list}>
        {items.map((item, index) => (
          <SettingsMenuRow
            key={item.id}
            item={item}
            last={index === items.length - 1}
            onSelect={onSelect}
          />
        ))}
      </View>
    </Card>
  );
}

type SettingsMenuRowProps = {
  item: SettingsMenuItem;
  /** The last row draws no rule — a card's own edge already ends the list. */
  last: boolean;
  onSelect: (id: string) => void;
};

function SettingsMenuRow({ item, last, onSelect }: SettingsMenuRowProps) {
  const styles = useStyles();
  const { hovered, focused, handlers } = useInteraction();
  const handlePress = useCallback(() => onSelect(item.id), [item.id, onSelect]);

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={item.label}
      onPress={handlePress}
      {...handlers}
      style={[
        styles.row,
        last ? null : styles.ruled,
        hovered ? styles.hovered : null,
        focused ? styles.focused : null,
      ]}
    >
      <Text style={styles.label}>{item.label}</Text>
      <View style={styles.chevron} />
    </Pressable>
  );
}

const useStyles = makeStyles((theme) => ({
  // The card's own `gap` would put air between rows a rule is meant to
  // divide, so the list overrides it and the rows carry their own rhythm.
  list: { marginVertical: -space.md },
  row: {
    minHeight: touchTarget.min,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: space.x3,
    paddingVertical: space.lg,
  },
  ruled: { borderBottomWidth: hairline.width, borderBottomColor: theme.hairline },
  hovered: { backgroundColor: theme.hoverFill },
  focused: {
    outlineWidth: focus.width,
    outlineStyle: "solid",
    outlineColor: theme.focusRing,
    outlineOffset: focus.offset,
  },
  label: { color: theme.text, ...text.ui("body") },
  /** Two borders of a square, rotated — the disclosure mark, drawn. */
  chevron: {
    width: 8,
    height: 8,
    borderRightWidth: 1.5,
    borderTopWidth: 1.5,
    borderColor: theme.textMuted,
    transform: [{ rotate: "45deg" }],
  },
}));
