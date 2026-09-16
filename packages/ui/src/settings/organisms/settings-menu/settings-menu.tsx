/**
 * `<SettingsMenu>` — the Settings tab's own list, as `S30` draws it: rows in
 * **groups**, each with a tinted tile, its label, and the one fact that tells
 * you what is behind it before you go there.
 *
 * **A card groups rows, and the groups are the design.** The deck has three —
 * the ledger's reference data, the things that run on their own, and the
 * things that leave the app — separated by a gap rather than a heading,
 * because a gap says *these belong together* without spending a word on it.
 * One card of every destination was the shape before, and it read as a list
 * of links rather than a place with parts.
 *
 * **The value line is not decoration.** *Four, one shared* · *31 in use* ·
 * *PLN · EUR · GBP* — each answers the question that sends you into the
 * screen, and a row whose figure is already the answer is a screen you do not
 * open. It is optional per row: a destination with nothing true to say yet
 * renders the label alone rather than a placeholder.
 *
 * **No title.** The tab shell draws the screen's name above the ground, so a
 * title inside a card would be the same word twice on one screen. That is
 * also why this component takes no `title` prop: there is no correct value
 * for it here, and an optional one would invite the duplicate back.
 *
 * **The chevron is drawn, not typed.** A glyph would depend on the face
 * shipping it — the same reason `CurrencyGrid`'s check mark is two borders on
 * a `View` rather than `✓`. The tiles are Phosphor, vendored as path data
 * (`shell/phosphor.tsx`), at regular weight: §2.8 gives duotone to the
 * navigation, and a tile beside a label that already names its destination is
 * an adornment rather than the navigation itself.
 */

import type { ReactElement } from "react";
import { useCallback } from "react";
import { Pressable, Text, View } from "react-native";
import Animated from "react-native-reanimated";
import { useInteraction } from "../../../primitives/interaction.ts";
import { usePressScale } from "../../../primitives/press-scale.ts";
import { Card } from "../../../shell/molecules/card/card";
import type { PhosphorIconProps } from "../../../shell/phosphor";
import {
  ArrowsLeftRightIcon,
  CreditCardIcon,
  CurrencyCircleDollarIcon,
  ShieldCheckIcon,
  TagIcon,
} from "../../../shell/phosphor";
import { text } from "../../../theme/fonts.ts";
import { useTheme } from "../../../theme/provider";
import { makeStyles } from "../../../theme/styles.ts";
import { focus, hairline, radius, space, touchTarget } from "../../../tokens.ts";

/** The glyphs a row can wear. Named by what the row *is*, never by the shape. */
export type SettingsMenuGlyph = "accounts" | "categories" | "currencies" | "rates" | "backup";

const GLYPHS = {
  accounts: CreditCardIcon,
  categories: TagIcon,
  currencies: CurrencyCircleDollarIcon,
  rates: ArrowsLeftRightIcon,
  backup: ShieldCheckIcon,
} as const satisfies Record<SettingsMenuGlyph, (props: PhosphorIconProps) => ReactElement>;

/** The box a tile's glyph is drawn in — the deck's 32pt square, and the glyph inside it. */
const TILE = 32;
const GLYPH = 17;

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
  /** The one fact behind the label. Omitted where nothing true is known yet. */
  value?: string;
  glyph: SettingsMenuGlyph;
};

export type SettingsMenuProps<Id extends string = string> = {
  /**
   * One array per card. The deck separates its groups by a gap, not a
   * heading — so a group is a position, and this is a list of them.
   */
  groups: readonly (readonly SettingsMenuItem<Id>[])[];
  onSelect: (id: Id) => void;
};

export function SettingsMenu<Id extends string>({ groups, onSelect }: SettingsMenuProps<Id>) {
  const styles = useStyles();

  return (
    <View style={styles.groups}>
      {groups.map((group) => (
        <Card key={group.map((item) => item.id).join("/")}>
          <View style={styles.list}>
            {group.map((item, index) => (
              <SettingsMenuRow
                key={item.id}
                item={item}
                last={index === group.length - 1}
                onSelect={onSelect}
              />
            ))}
          </View>
        </Card>
      ))}
    </View>
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
  const theme = useTheme();
  const { hovered, focused, handlers } = useInteraction();
  // `useInteraction` is hover and focus, and neither fires from a touch
  // screen — so on two of the three shipping targets the row gave nothing
  // back between the tap and the route change. `usePressScale` is what
  // `Button` uses for exactly this, and it is the reason these rows can stop
  // being `Button`s without costing anything.
  const press = usePressScale();
  const handlePress = useCallback(() => onSelect(item.id), [item.id, onSelect]);
  const Glyph = GLYPHS[item.glyph];

  return (
    <Animated.View style={press.style}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={item.value === undefined ? item.label : `${item.label}, ${item.value}`}
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
        <View style={styles.tile}>
          <Glyph size={GLYPH} color={theme.accentIcon} />
        </View>
        <View style={styles.words}>
          <Text style={styles.label}>{item.label}</Text>
          {item.value === undefined ? null : <Text style={styles.value}>{item.value}</Text>}
        </View>
        <View style={styles.chevron} />
      </Pressable>
    </Animated.View>
  );
}

const useStyles = makeStyles((theme) => ({
  /** The deck's gap between cards — the only thing separating one group from the next. */
  groups: { gap: space.x3b },
  // Trims 8 px off the card's own padding, top and bottom. Each row already
  // carries its own and a rule between it and the next; the card's padding
  // was tuned for content that carries neither, and left alone it makes the
  // first and last rows sit deeper than the ones between.
  list: { marginVertical: -space.md },
  row: {
    minHeight: touchTarget.row,
    flexDirection: "row",
    alignItems: "center",
    gap: space.xl,
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
  tile: {
    width: TILE,
    height: TILE,
    borderRadius: radius.sm,
    backgroundColor: theme.accentFill,
    alignItems: "center",
    justifyContent: "center",
    flexShrink: 0,
  },
  words: { flex: 1, gap: space.xxs },
  label: { color: theme.text, ...text.ui("bodySm", 600) },
  value: { color: theme.textMuted, ...text.ui("caption", 400) },
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
