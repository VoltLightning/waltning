/**
 * `<CurrencyChip>` — `design-system/04` §4.5, `SPEC.md` §7.0.
 *
 * *"The display-currency toggle, resident in every header. Pinned currencies
 * … with the active one marked; tapping re-expresses every figure on screen
 * at that row's own historical rate. Switching is free — no backfill, no
 * confirmation, nothing written."*
 *
 * **Nothing here is a registry write.** `onChange` reaches
 * `useDisplayCurrency`'s controller — a device preference, not an operation —
 * so this component only ever calls back with a code; the caller decides what
 * that means.
 *
 * **Cycling is the whole interaction at three pins or fewer.** A tap advances
 * to the next pinned currency, wrapping past the last — the header never
 * needs a chevron or a panel for the common case S17 §3 seeds (three). Past
 * three, cycling stops being a single tap's worth of intent (`04` §4.5 itself
 * says nothing past "pinned"), so a tap calls `onExpand` instead and leaves
 * presenting a picker to the caller — `shell/bottom-sheet` is chrome this
 * foundation module may not import (`tests/module-boundaries.test.ts`).
 */

import { useCallback } from "react";
import { Pressable, Text, View } from "react-native";
import { useT } from "../i18n/provider";
import { useInteraction } from "../primitives/interaction.ts";
import { text } from "../theme/fonts.ts";
import { makeStyles } from "../theme/styles.ts";
import { focus, radius, space, touchTarget } from "../tokens.ts";

const CYCLE_LIMIT = 3;

export type CurrencyChipCurrency = {
  code: string;
};

export type CurrencyChipProps = {
  /** The pinned set, in the order §7.0's toggle shows them. Empty renders nothing. */
  pinned: readonly CurrencyChipCurrency[];
  /** The currently active display currency — always one of `pinned` once hydrated. */
  active: string;
  onChange: (code: string) => void;
  /** Called on tap instead of cycling once more than three are pinned. */
  onExpand?: () => void;
};

export function CurrencyChip({ pinned, active, onChange, onExpand }: CurrencyChipProps) {
  const t = useT();
  const styles = useStyles();
  const { focused, handlers } = useInteraction();

  const cycles = pinned.length <= CYCLE_LIMIT;
  const index = pinned.findIndex((currency) => currency.code === active);

  const cycleNext = useCallback(() => {
    if (pinned.length < 2) return;
    const next = pinned[(index + 1 + pinned.length) % pinned.length];
    if (next) onChange(next.code);
  }, [pinned, index, onChange]);

  const handlePress = useCallback(() => {
    if (!cycles && onExpand) {
      onExpand();
      return;
    }
    cycleNext();
  }, [cycles, onExpand, cycleNext]);

  if (pinned.length === 0) return null;

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={t("fx.currencyChipLabel", { currency: active })}
      onPress={handlePress}
      {...handlers}
      style={[styles.chip, focused ? styles.focused : null]}
    >
      <View style={styles.row}>
        {pinned.map((currency) => (
          <Text
            key={currency.code}
            style={[styles.code, currency.code === active ? styles.codeActive : null]}
          >
            {currency.code}
          </Text>
        ))}
      </View>
    </Pressable>
  );
}

const useStyles = makeStyles((theme) => ({
  chip: {
    flexDirection: "row",
    alignItems: "center",
    minHeight: touchTarget.min,
    borderWidth: 1,
    borderColor: theme.shellNavActiveFill,
    borderRadius: radius.sm,
    paddingHorizontal: space.lg,
    paddingVertical: space.xs,
  },
  row: { flexDirection: "row", gap: space.sm },
  // A 2px `borderBottomWidth`, never `borderRadius` — a bar is sharp by
  // construction, and rounding it would read as a pill, the one shape this
  // design system's own taste refuses (`waltning-design-taste`).
  code: {
    color: theme.shellTextMuted,
    ...text.ui("bodySm", 600),
    borderBottomWidth: 2,
    borderBottomColor: "transparent",
  },
  // **Never weight alone (P5).** `theme.shellText` beside `theme.shellTextMuted`
  // is a colour difference a low-vision or colour-deficient reader may not
  // resolve — the accent bar is the second, shape-based signal every other
  // amber/asserted marker in this system already carries.
  codeActive: { color: theme.shellText, borderBottomColor: theme.accent },
  focused: {
    outlineWidth: focus.width,
    outlineColor: theme.focusRing,
    outlineOffset: focus.offset,
  },
}));
