/**
 * `<CurrencyGrid>` — `design-system/04` §4.x. Choosing **one** currency out of
 * a set small enough to show whole — account creation is the one call site
 * today. `CurrencyChip` (§4.5) is a different question: which of a few
 * *pinned* currencies a header displays figures in, cycled one tap at a time.
 * A form never offers that toggle for a choice it only ever makes once.
 *
 * **A grid, not a chip row or a `Select`.** The owner's own words, first said
 * of `AccountPicker`: *"we need to use a grid there."* A wrapped row of chips
 * reads its options at whatever width the label happens to need, so twenty
 * currencies wrap unevenly and a short code sits next to a long one with no
 * shared rhythm; a `Select` hides every option behind one already-collapsed
 * value, which is the wrong trade for a field the form expects to be looked
 * at, not remembered. A grid keeps every option visible at once, at one width
 * each, the same anatomy `AccountPicker`'s tile grid and `CategorySheet`'s
 * leaf grid already settled on.
 *
 * **Code, then symbol, then name.** The code is what a person will read on
 * every figure the account ever holds afterwards, so the choice and its
 * consequence read the same (`create-account-form.tsx`'s own reasoning for
 * `CurrencyChoice`, carried over); the symbol beside it is the glyph those
 * figures will actually carry; the name rides along in one line, for whoever
 * thinks in the word rather than the code.
 */

import type { CurrencyCode } from "@waltning/core/money";
import { useCallback } from "react";
import { Pressable, Text, View } from "react-native";
import Animated from "react-native-reanimated";
import { useInteraction } from "../primitives/interaction.ts";
import { usePressScale } from "../primitives/press-scale.ts";
import { useBreakpoint } from "../primitives/use-breakpoint.ts";
import { text } from "../theme/fonts.ts";
import { makeStyles } from "../theme/styles.ts";
import { focus, radius, space, touchTarget } from "../tokens.ts";

export type CurrencyGridItem = { code: CurrencyCode; name: string; symbol: string };

export type CurrencyGridProps = {
  /** Every currency the form offers. Empty renders nothing — the caller's own message for that state. */
  currencies: readonly CurrencyGridItem[];
  /** The current pick, or `null` before one is made. */
  selected: CurrencyCode | null;
  onSelect: (code: CurrencyCode) => void;
  /** The `radiogroup`'s own accessible label. */
  label?: string;
  disabled?: boolean;
};

export function CurrencyGrid({
  currencies,
  selected,
  onSelect,
  label,
  disabled = false,
}: CurrencyGridProps) {
  const styles = useStyles();
  const breakpoint = useBreakpoint();

  if (currencies.length === 0) return null;

  return (
    <View accessibilityRole="radiogroup" accessibilityLabel={label} style={styles.grid}>
      {currencies.map((currency) => (
        <CurrencyTile
          key={currency.code}
          currency={currency}
          selected={currency.code === selected}
          disabled={disabled}
          desk={breakpoint === "desk"}
          onSelect={onSelect}
        />
      ))}
    </View>
  );
}

type CurrencyTileProps = {
  currency: CurrencyGridItem;
  selected: boolean;
  disabled: boolean;
  /** Four columns at `breakpoint.desk`, three otherwise (`useBreakpoint`, never a raw width read). */
  desk: boolean;
  onSelect: (code: CurrencyCode) => void;
};

/** One cell of the grid — `role="radio"` inside the grid's `radiogroup`, the same shape `AccountTile` and `LeafCell` already use. */
function CurrencyTile({ currency, selected, disabled, desk, onSelect }: CurrencyTileProps) {
  const styles = useStyles();
  const { hovered, focused, handlers } = useInteraction();
  const press = usePressScale();
  const handlePress = useCallback(() => onSelect(currency.code), [currency.code, onSelect]);

  return (
    <Animated.View style={[press.style, desk ? styles.cellWrapDesk : styles.cellWrapPhone]}>
      <Pressable
        accessibilityRole="radio"
        accessibilityLabel={currency.name}
        accessibilityState={{ checked: selected, disabled }}
        aria-checked={selected}
        aria-disabled={disabled}
        disabled={disabled}
        onPress={handlePress}
        onPressIn={press.onPressIn}
        onPressOut={press.onPressOut}
        {...handlers}
        style={[
          styles.cell,
          selected ? styles.cellSelected : null,
          hovered && !selected && !disabled ? styles.cellHovered : null,
          focused ? styles.focused : null,
          disabled ? styles.disabled : null,
        ]}
      >
        <View style={styles.cellHead}>
          <Text style={[styles.code, selected ? styles.codeSelected : null]}>{currency.code}</Text>
          <Text style={styles.symbol}>{currency.symbol}</Text>
        </View>
        <Text style={styles.name} numberOfLines={1}>
          {currency.name}
        </Text>
      </Pressable>
    </Animated.View>
  );
}

const useStyles = makeStyles((theme) => ({
  grid: { flexDirection: "row", flexWrap: "wrap", gap: space.md },
  // Approximated the way `AccountPicker`'s own `cellWrap` is — slightly under
  // the exact fraction, to leave room for the row's own `gap` rather than
  // computing it from a read width (`useBreakpoint`, never
  // `useWindowDimensions` maths).
  cellWrapPhone: { flexBasis: "31%" },
  cellWrapDesk: { flexBasis: "23%" },
  cell: {
    minHeight: touchTarget.min,
    gap: space.xs,
    borderWidth: 1,
    borderColor: theme.border,
    borderRadius: radius.sm,
    backgroundColor: theme.surface,
    paddingHorizontal: space.x2,
    paddingVertical: space.lg,
  },
  cellHovered: { backgroundColor: theme.hoverFill },
  cellSelected: { borderColor: theme.accentFillBorder, backgroundColor: theme.accentFill },
  cellHead: { flexDirection: "row", alignItems: "baseline", gap: space.xs },
  code: { color: theme.text, ...text.ui("body") },
  codeSelected: { color: theme.accentText, ...text.ui("body", 600) },
  symbol: { color: theme.textMuted, ...text.ui("body") },
  name: { color: theme.textMuted, ...text.ui("caption") },
  disabled: { opacity: 0.45 },
  focused: {
    outlineWidth: focus.width,
    outlineColor: theme.focusRing,
    outlineOffset: focus.offset,
  },
}));
