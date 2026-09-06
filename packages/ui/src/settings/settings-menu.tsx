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
import Animated from "react-native-reanimated";
import { useInteraction } from "../primitives/interaction.ts";
import { usePressScale } from "../primitives/press-scale.ts";
import { Card } from "../shell/card";
import { text } from "../theme/fonts.ts";
import { makeStyles } from "../theme/styles.ts";
import { focus, hairline, space, touchTarget } from "../tokens.ts";

export type SettingsMenuItem<Id extends string = string> = {
  /**
   * Handed back to `onSelect` — the screen owns what it means (a route,
   * here). **Generic**, so the ids the screen lists and the ids its handler
   * accepts are the same union: a row whose id is a typo used to render,
   * look tappable, and do nothing, with the compiler content and nothing
   * thrown. The narrowing is the caller's to spend or ignore.
   */
  id: Id;
  label: string;
};

export type SettingsMenuProps<Id extends string = string> = {
  items: readonly SettingsMenuItem<Id>[];
  onSelect: (id: Id) => void;
};

export function SettingsMenu<Id extends string>({ items, onSelect }: SettingsMenuProps<Id>) {
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

type SettingsMenuRowProps<Id extends string> = {
  item: SettingsMenuItem<Id>;
  /** The last row draws no rule — a card's own edge already ends the list. */
  last: boolean;
  onSelect: (id: Id) => void;
};

function SettingsMenuRow<Id extends string>({ item, last, onSelect }: SettingsMenuRowProps<Id>) {
  const styles = useStyles();
  const { hovered, focused, handlers } = useInteraction();
  // `useInteraction` is hover and focus, and neither fires from a touch
  // screen — so on two of the three shipping targets the row gave nothing
  // back between the tap and the route change. `usePressScale` is what
  // `Button` uses for exactly this, and it is the reason these rows can stop
  // being `Button`s without costing anything.
  const press = usePressScale();
  const handlePress = useCallback(() => onSelect(item.id), [item.id, onSelect]);

  return (
    <Animated.View style={press.style}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={item.label}
        onPress={handlePress}
        onPressIn={press.onPressIn}
        onPressOut={press.onPressOut}
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
    </Animated.View>
  );
}

const useStyles = makeStyles((theme) => ({
  // Trims 8 px off the card's own 22 px padding, top and bottom. Each row
  // already carries 10 px of its own and a rule between it and the next;
  // the card's padding was tuned for content that carries neither, and left
  // alone it makes the first and last rows sit deeper than the ones between.
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
