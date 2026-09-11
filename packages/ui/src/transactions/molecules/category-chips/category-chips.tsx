/**
 * `<CategoryChips>` — the row of a few categories under the choices card
 * (S05 §3): the ones this ledger uses most for this kind, each in its own
 * tint, one tap to pick.
 *
 * **The chips are the shortcut; the row above is the field.** A category picked
 * here lands in the *Category* row exactly as one picked in the sheet does —
 * the row is the value, the chips are four of the likeliest answers within a
 * thumb's reach. The picked one is drawn heavier, never larger.
 *
 * **Tinted by name**, through the same `categoryTintFor` a ledger row's tile
 * and a *Where it went* bar use, so a category is one colour everywhere it
 * appears (`primitives/monogram.ts`). Text carries the pick as well
 * (`aria-checked`), never tint alone (P5).
 */

import { useCallback } from "react";
import { Pressable, Text, View } from "react-native";
import { useInteraction } from "../../../primitives/interaction.ts";
import { categoryTintFor } from "../../../primitives/monogram.ts";
import { text } from "../../../theme/fonts.ts";
import { useTheme } from "../../../theme/provider";
import { makeStyles } from "../../../theme/styles.ts";
import { focus, radius, space, touchTarget } from "../../../tokens.ts";

export type CategoryChipModel = { id: string; name: string };

export type CategoryChipsProps = {
  categories: readonly CategoryChipModel[];
  selectedId: string | null;
  onPick: (id: string) => void;
};

export function CategoryChips({ categories, selectedId, onPick }: CategoryChipsProps) {
  const styles = useStyles();
  if (categories.length === 0) return null;
  return (
    <View accessibilityRole="radiogroup" style={styles.row}>
      {categories.map((category) => (
        <CategoryChip
          key={category.id}
          category={category}
          selected={category.id === selectedId}
          onPick={onPick}
        />
      ))}
    </View>
  );
}

type CategoryChipProps = {
  category: CategoryChipModel;
  selected: boolean;
  onPick: (id: string) => void;
};

function CategoryChip({ category, selected, onPick }: CategoryChipProps) {
  const theme = useTheme();
  const styles = useStyles();
  const { hovered, focused, handlers } = useInteraction();
  const tint = categoryTintFor(category.name, theme);
  const fill = { backgroundColor: tint.fill };
  const ink = { color: tint.ink };
  const handlePress = useCallback(() => onPick(category.id), [onPick, category.id]);
  return (
    <Pressable
      // The deck's chip is 34 tall; §10's 44 floor is met by the slop, the
      // way `Button`'s smaller sizes meet it.
      hitSlop={CHIP_SLOP}
      accessibilityRole="radio"
      accessibilityLabel={category.name}
      accessibilityState={{ checked: selected }}
      aria-checked={selected}
      onPress={handlePress}
      {...handlers}
      style={[styles.chip, fill, hovered ? styles.hovered : null, focused ? styles.focused : null]}
    >
      <Text style={[selected ? styles.labelSelected : styles.label, ink]}>{category.name}</Text>
    </Pressable>
  );
}

/** (44 − 34) / 2 above and below — the chip's drawn height is the deck's, its target is §10's. */
const CHIP_SLOP = { top: space.lg / 2, bottom: space.lg / 2 };

const useStyles = makeStyles((theme) => ({
  // Wrapping, 8 apart, 4 in from the gutter — the deck's row.
  row: { flexDirection: "row", flexWrap: "wrap", gap: space.md, paddingHorizontal: space.xs },
  chip: {
    minHeight: touchTarget.min - space.lg,
    justifyContent: "center",
    paddingVertical: space.md,
    paddingHorizontal: space.x2,
    borderRadius: radius.sm,
  },
  hovered: { opacity: 0.88 },
  focused: {
    outlineWidth: focus.width,
    outlineColor: theme.focusRing,
    outlineOffset: focus.offset,
  },
  label: { ...text.ui("label") },
  labelSelected: { ...text.ui("label", 600) },
}));
