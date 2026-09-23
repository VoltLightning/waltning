/**
 * `<ShareRow>` — one line of S36's split: who, how much, and what it means.
 *
 * **Your row and theirs are the same shape and say different things.** A
 * counterparty's share is a debt, so it says *owes you* in words (P5); yours
 * is an ordinary expense, so it says what it was spent on. J08 §4 is the
 * reason the two are not interchangeable — a receivable against yourself
 * would keep the clearing account from ever reaching zero — and one row
 * drawing both states is what keeps that distinction visible while a person
 * is editing the split rather than only afterwards.
 *
 * **The amount is a field, not a figure, and that is the whole difference
 * from `<CounterpartyRow>`.** S12's row reports a balance; this one is being
 * decided. Typing in it is what switches the split to *Custom* (S36 §7) —
 * the row reports the keystroke and the screen decides what it means, because
 * a molecule that knew about modes would be a screen.
 *
 * **A weight stepper, only in *Shares*.** Absent in the other two modes
 * rather than disabled: a control that cannot do anything is still a control
 * a thumb aims at.
 */

import type { Money } from "@waltning/core/money";
import { useCallback } from "react";
import { Text, View } from "react-native";
import { Amount } from "../../../fx/atoms/amount/amount";
import { useT } from "../../../i18n/provider";
import { IconButton } from "../../../primitives/atoms/icon-button/icon-button";
import { PressableScaled } from "../../../primitives/atoms/pressable-scaled/pressable-scaled";
import { TextField } from "../../../primitives/atoms/text-field/text-field";
import { MinusIcon, PlusIcon, XIcon } from "../../../primitives/icons";
import { useInteraction } from "../../../primitives/interaction.ts";
import { monogramFor } from "../../../primitives/monogram.ts";
import { text } from "../../../theme/fonts.ts";
import { useTheme } from "../../../theme/provider";
import { makeStyles } from "../../../theme/styles.ts";
import { focus, radius, space, touchTarget } from "../../../tokens.ts";

export type ShareRowProps = {
  /**
   * This row's own key, handed back with every callback.
   *
   * The alternative is one bound closure per row in the caller, which either
   * creates a function inside JSX (`architecture/11` bans it) or caches
   * handlers outside the component, where they outlive the screen and close
   * over a setter from a previous mount. Passing the key back costs one
   * argument and has neither failure.
   */
  id: string;
  /** *You*, or the counterparty's own name — what the monogram is built from. */
  name: string;
  /** Your own share (J08 §4): a category, and deliberately not a debt. */
  isOwn: boolean;
  /** Shown on your row only, because yours is the one that becomes spending. */
  categoryName?: string | undefined;
  /** Opens the category sheet. Your row only. */
  onPressCategory?: (() => void) | undefined;
  amount: Money;
  currency: string;
  decimals: number;
  /**
   * The amount as typed, when this row is being edited.
   *
   * Absent means the computed split is showing — `Even` and `Shares` own
   * every figure, and a field holding a formatted number would fight the
   * mode the moment it recomputed.
   */
  draft?: string | undefined;
  onAmountChange: (id: string, value: string) => void;
  /** Tapping the figure is what starts editing it — S36 §7's own switch to *Custom*. */
  onEdit: () => void;
  /** `Shares` only. Absent draws no stepper at all. */
  weight?: number | undefined;
  onWeightChange?: ((id: string, weight: number) => void) | undefined;
  /** Absent on a row that cannot be removed. */
  onRemove?: ((id: string) => void) | undefined;
};

export function ShareRow({
  id,
  name,
  isOwn,
  categoryName,
  onPressCategory,
  amount,
  currency,
  decimals,
  draft,
  onAmountChange,
  onEdit,
  weight,
  onWeightChange,
  onRemove,
}: ShareRowProps) {
  const t = useT();
  const theme = useTheme();
  const styles = useStyles();
  // §2.6 — the two taps this row owns are its own controls, so the ring is
  // this component's to draw. One pair of handlers each: they are never
  // focusable at the same time (`draft` swaps one for a field).
  const category = useInteraction();
  const figure = useInteraction();
  const monogram = monogramFor(name, theme);
  // Built above the JSX, never inside it — `tests/architecture.test.ts`, and
  // `counterparty-row.tsx` takes the same shape for the same tint.
  const monogramFill = { backgroundColor: monogram.fill };
  const monogramInk = { color: monogram.ink };

  const less = useCallback(() => {
    if (onWeightChange && weight !== undefined) onWeightChange(id, Math.max(1, weight - 1));
  }, [id, onWeightChange, weight]);
  const more = useCallback(() => {
    if (onWeightChange && weight !== undefined) onWeightChange(id, weight + 1);
  }, [id, onWeightChange, weight]);
  const change = useCallback((value: string) => onAmountChange(id, value), [id, onAmountChange]);
  const remove = useCallback(() => onRemove?.(id), [id, onRemove]);

  return (
    <View style={styles.root}>
      <View style={[styles.monogram, monogramFill]}>
        <Text style={[styles.monogramLetter, monogramInk]}>{monogram.letter}</Text>
      </View>

      <View style={styles.identity}>
        <Text numberOfLines={1} style={styles.name}>
          {name}
        </Text>
        {isOwn ? (
          <PressableScaled
            accessibilityRole="button"
            accessibilityLabel={t("allocate.chooseCategory")}
            onPress={onPressCategory}
            {...category.handlers}
            style={[styles.category, category.focused ? styles.focused : null]}
          >
            <Text numberOfLines={1} style={styles.meaning}>
              {categoryName ?? t("allocate.chooseCategory")}
            </Text>
          </PressableScaled>
        ) : (
          // P5 — what this row means, in words. A share is a debt or it is
          // nothing, and the figure beside it says neither on its own.
          <Text style={styles.meaning}>{t("counterparties.owesYou")}</Text>
        )}
      </View>

      {weight === undefined ? null : (
        <View style={styles.weight}>
          <IconButton label={t("allocate.fewerShares", { name })} onPress={less} size={32}>
            <MinusIcon size={14} color={theme.textMuted} />
          </IconButton>
          <Text style={styles.weightValue}>{weight}</Text>
          <IconButton label={t("allocate.moreShares", { name })} onPress={more} size={32}>
            <PlusIcon size={14} color={theme.textMuted} />
          </IconButton>
        </View>
      )}

      <View style={styles.amount}>
        {draft === undefined ? (
          <PressableScaled
            accessibilityRole="button"
            accessibilityLabel={t("allocate.editShare", { name })}
            onPress={onEdit}
            {...figure.handlers}
            style={[styles.amountRead, figure.focused ? styles.focused : null]}
          >
            <Amount value={amount} currency={currency} decimals={decimals} size="small" />
          </PressableScaled>
        ) : (
          <TextField
            label={t("allocate.shareOf", { name })}
            hideLabel
            value={draft}
            onChangeText={change}
            keyboardType="decimal-pad"
          />
        )}
      </View>

      {onRemove === undefined ? null : (
        <IconButton label={t("allocate.removeShare", { name })} onPress={remove} size={32}>
          <XIcon size={12} color={theme.textMuted} />
        </IconButton>
      )}
    </View>
  );
}

const useStyles = makeStyles((theme) => ({
  root: { flexDirection: "row", alignItems: "center", gap: space.md, minHeight: touchTarget.min },
  monogram: {
    width: 34,
    height: 34,
    borderRadius: radius.sm,
    alignItems: "center",
    justifyContent: "center",
  },
  monogramLetter: { ...text.ui("label", 600) },
  identity: { flex: 1, gap: space.xxs, minWidth: 0 },
  name: { color: theme.text, ...text.ui("body", 600) },
  category: { alignSelf: "flex-start" },
  meaning: { color: theme.textMuted, ...text.ui("caption") },
  weight: { flexDirection: "row", alignItems: "center", gap: space.xs },
  weightValue: { color: theme.text, ...text.ui("label", 600), minWidth: 16, textAlign: "center" },
  amount: { minWidth: 96, alignItems: "flex-end" },
  amountRead: { paddingVertical: space.xs, borderRadius: radius.sm },
  focused: {
    outlineWidth: focus.width,
    outlineColor: theme.focusRing,
    outlineOffset: focus.offset,
    outlineStyle: "solid",
  },
}));
