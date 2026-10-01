/**
 * `<TransferRow>` — S10 §3, §8: "a transfer is one row. Rendering two would
 * reintroduce the exact defect the data model exists to remove."
 *
 * **Two amounts only when there are two figures to state.** A cross-currency
 * transfer needs both legs in their own currency — `4a`'s FX margin lives in
 * the difference, and a shared-symbol shorthand renders exactly that case
 * wrong. A same-currency one has no such difference: *-150.00 PLN → 150.00
 * PLN* restates one figure twice, which is what S10's drawing shows as a
 * single trailing *220,00*. The redundant half also cost the width the
 * identity needed, truncating the destination this row exists to name.
 *
 * **The destination leads, and the pair sits under it.** S10's drawing gives a
 * transfer the two-line identity every other row has — *To Savings* over
 * *Transfer · Bank A → Savings* — and this row drew the pair on one line under
 * `numberOfLines={1}`. Two real account names plus two amounts never fit 390pt,
 * so the line tail-truncated to *Bank A · P…* and ate the destination: the half
 * of a transfer that says where the money went, cut from the row that exists to
 * say it.
 *
 * **The tile every other row has.** S10's drawing gives a transfer a 24pt
 * tile carrying a two-way arrow, on the neutral fill rather than a category
 * tint — a transfer belongs to no category. Without it the row's text began
 * where its neighbours' *tiles* did, so a register alternating transfers with
 * anything else had two left edges.
 *
 * **`kind="transfer"` on both legs** (`TransactionRow`'s own reasoning):
 * a transfer moves money between your own accounts, so it is neither a gain
 * nor a loss, and the sign-based `auto` colour would paint one leg green and
 * the other red for exactly that reason.
 *
 * **Pressable exactly as `TransactionRow` is.** S09 opens any row, a transfer
 * included — it draws the pair and its months — but this row took no `onPress`,
 * so the one row a list could not open was the one that moved money between
 * two of your accounts. Same role, same hover, focus and press scale; absent
 * `onPress`, a plain `View`.
 */

import type * as money from "@waltning/core/money";
import { useCallback } from "react";
import { Pressable, Text, View } from "react-native";
import Animated from "react-native-reanimated";
import { Amount } from "../../../fx/atoms/amount/amount";
import { useT } from "../../../i18n/provider";
import { useInteraction } from "../../../primitives/interaction.ts";
import { usePressScale } from "../../../primitives/press-scale.ts";
import { ArrowsLeftRightIcon } from "../../../shell/phosphor";
import { text } from "../../../theme/fonts.ts";
import { useTheme } from "../../../theme/provider";
import { makeStyles } from "../../../theme/styles.ts";
import { focus, radius, space, tabularNums, touchTarget } from "../../../tokens.ts";

export type TransferRowProps = {
  /** Bare `YYYY-MM-DD`. Rendered as given — never through a `Date` (C28). */
  date: string;
  fromAccountName: string;
  toAccountName: string;
  /** Already signed — negative, the outgoing leg. */
  amount: money.Money;
  currency: string;
  decimals?: number;
  /** Already signed — positive, the incoming leg. */
  toAmount: money.Money;
  toCurrency: string;
  toDecimals?: number;
  /**
   * Draw the date — off inside a `<DayGroup>`, whose header has already given
   * it, exactly as `TransactionRow` does. A transfer was the one row that drew
   * its date anyway, so a day of expenses and one transfer had a date on one
   * row only.
   */
  withDate?: boolean;
  /** Open the transfer — S09. Absent, the row is a plain `View`. */
  onPress?: () => void;
};

export function TransferRow({
  date,
  fromAccountName,
  toAccountName,
  amount,
  currency,
  decimals = 2,
  toAmount,
  toCurrency,
  toDecimals = 2,
  withDate = true,
  onPress,
}: TransferRowProps) {
  const t = useT();
  const theme = useTheme();
  const styles = useStyles();
  const arrow = t("transactions.transferArrow");
  // Built above the JSX, never inline — the architecture test's own rule, and
  // `brand-icon.tsx`'s reason for computing its own box the same way.
  const tileFill = { backgroundColor: theme.insetFill };
  const { hovered, focused, handlers } = useInteraction();
  const press = usePressScale();
  const handlePress = useCallback(() => onPress?.(), [onPress]);

  const content = (
    <>
      {withDate ? <Text style={styles.date}>{date.slice(5)}</Text> : null}
      <View style={[styles.tile, tileFill]}>
        <ArrowsLeftRightIcon size={15} color={theme.textMuted} />
      </View>
      <View style={styles.identity}>
        <Text style={styles.destination} numberOfLines={1}>
          {t("transactions.transferTo", { account: toAccountName })}
        </Text>
        <Text style={styles.accounts} numberOfLines={1}>
          {t("transactions.transferKind")} · {fromAccountName} {arrow} {toAccountName}
        </Text>
      </View>
      <View style={styles.amounts}>
        <Amount
          value={amount}
          currency={currency}
          decimals={decimals}
          size="small"
          kind="transfer"
        />
        {currency === toCurrency ? null : (
          <>
            <Text style={styles.arrow}>{arrow}</Text>
            <Amount
              value={toAmount}
              currency={toCurrency}
              decimals={toDecimals}
              size="small"
              kind="transfer"
            />
          </>
        )}
      </View>
    </>
  );

  if (!onPress) {
    return <View style={styles.row}>{content}</View>;
  }

  return (
    <Animated.View style={press.style}>
      {/* No `accessibilityLabel` — the content is the name (`EntryRow`). */}
      <Pressable
        accessibilityRole="button"
        onPress={handlePress}
        onPressIn={press.onPressIn}
        onPressOut={press.onPressOut}
        {...handlers}
        style={[styles.row, hovered ? styles.hovered : null, focused ? styles.focused : null]}
      >
        {content}
      </Pressable>
    </Animated.View>
  );
}

const useStyles = makeStyles((theme) => ({
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: space.xl,
    paddingVertical: space.lg,
    minHeight: touchTarget.row,
  },
  hovered: { backgroundColor: theme.hoverFill },
  focused: {
    outlineWidth: focus.width,
    outlineColor: theme.focusRing,
    outlineOffset: focus.offset,
  },
  date: {
    color: theme.textMuted,
    ...text.ui("caption"),
    width: 44,
    fontVariant: [...tabularNums],
  },
  tile: {
    width: 24,
    height: 24,
    borderRadius: radius.xs,
    alignItems: "center",
    justifyContent: "center",
  },
  identity: { flex: 1, gap: space.xxs },
  destination: { color: theme.text, ...text.ui("bodySm", 600) },
  accounts: { color: theme.textMuted, ...text.ui("caption") },
  amounts: { flexDirection: "row", alignItems: "center", gap: space.sm },
  arrow: { color: theme.textMuted, ...text.ui("caption") },
}));
