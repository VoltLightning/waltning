/**
 * `<TransactionRow>` — `design-system/05` §5.2.
 *
 * Date · payee · category · `Amount`, with the `BIZ` tag when the row is
 * business — §3.3 requires that marker in **every** view a business row appears
 * in, because a row marked in one list and bare in another ends as a tax figure
 * nobody can explain.
 *
 * Lived in a `molecules/rows.tsx` that also held `BalanceRow`: two domains in
 * one file, filed by size. §5.2's "Rows" heading is a shape, not a domain — the
 * eight components under it belong to six different ones.
 *
 * **The amount arrives already signed** (`computations.md` §1, computed once in
 * SQL). This does not decide the sign from the type: that would be a second
 * implementation, and the two disagree on `adjustment`, which carries its own.
 *
 * **The colour, though, does come from the type.** A transfer's two legs are
 * signed opposite ways and are neither income nor spend, so sign alone would
 * paint one leg green and the other red — money that moved between your own
 * accounts, read as a gain and a loss. The row maps the ledger's type onto
 * `<Amount>`'s `kind`; the component never sees a colour.
 *
 * **`onPress` is optional, and its absence changes what the row *is*.**
 * S09's whole reason to exist is a tap on one of these rows, so a row that
 * can open it takes the `button` role and the same hover/focus treatment
 * every other pressable primitive carries (§2.6: focus is never colour
 * alone); a row with nothing to open — none exists yet — stays a plain
 * `View`, because a `button` role that does nothing is a worse trap than no
 * role at all.
 */

import type * as money from "@waltning/core/money";
import { useCallback } from "react";
import { Pressable, Text, View } from "react-native";
import Animated from "react-native-reanimated";
import { Amount, type AmountKind } from "../fx/amount";
import { useInteraction } from "../primitives/interaction.ts";
import { usePressScale } from "../primitives/press-scale.ts";
import { Tag } from "../primitives/tag";
import { text } from "../theme/fonts.ts";
import { makeStyles } from "../theme/styles.ts";
import { focus, space, tabularNums, touchTarget } from "../tokens.ts";
import { BrandIcon } from "./brand-icon";

/** The ledger's own vocabulary — `schema/enums`. */
export type TransactionType = "expense" | "income" | "transfer" | "adjustment";

export type TransactionRowProps = {
  /** Bare `YYYY-MM-DD`. Rendered as given — never through a `Date` (C28). */
  date: string;
  payee: string;
  category?: string | null;
  account?: string | null;
  /** **Already signed** per §1. */
  amount: money.Money;
  currency: string;
  decimals?: number;
  /**
   * Decides the figure's colour, not its sign. Optional because older callers
   * do not carry it; absent, the row falls back to sign — right for expense
   * and income, wrong for the two legs of a transfer.
   */
  type?: TransactionType;
  isBusiness?: boolean;
  /**
   * §5.5's own note — "with role markers" — the row's counterparty role
   * (S13's history), already resolved to a word by the caller. Neutral, text
   * rather than a new colour: the role is a fact about the row, not a
   * severity.
   */
  roleTag?: string;
  /**
   * `SPEC.md` §14.4b. Absent from a caller that has not read it yet — the
   * row then draws no `BrandIcon` at all rather than a fallback monogram for
   * every row a screen has not been updated to pass this through, which
   * would read as "we tried to recognise this and found nothing" on a
   * screen that never asked.
   */
  brandKey?: string | null;
  /** S09: tap the row, see everything the ledger knows about it. Omit to keep the row inert. */
  onPress?: () => void;
};

/**
 * Exported for `TransactionHero` (S09) — the same mapping, so a row and the
 * detail screen's own hero figure never disagree about what colour a
 * transfer or an adjustment gets.
 */
export const TRANSACTION_AMOUNT_KIND: Record<TransactionType, AmountKind> = {
  expense: "spend",
  income: "income",
  transfer: "transfer",
  // Carries its own sign and its own meaning; sign decides.
  adjustment: "auto",
};

export function TransactionRow({
  date,
  payee,
  category,
  account,
  amount,
  currency,
  decimals = 2,
  type: transactionType,
  isBusiness = false,
  roleTag,
  brandKey,
  onPress,
}: TransactionRowProps) {
  const meta = [account, category].filter(Boolean).join(" · ");

  const styles = useStyles();
  const { hovered, focused, handlers } = useInteraction();
  const press = usePressScale();
  const handlePress = useCallback(() => onPress?.(), [onPress]);

  const content = (
    <>
      {/*
        The bare accounting date. These are `YYYY-MM-DD` strings, not moments —
        rendering one through a `Date` is how a capture lands on the wrong day
        when the phone is still on the previous timezone (C28).
      */}
      <Text style={styles.date}>{date.slice(5)}</Text>
      {/* `SPEC.md` §14.4b — absent entirely, not a fallback monogram, for a
          caller that has not passed `brandKey` yet (see the prop's own doc). */}
      {brandKey === undefined ? null : <BrandIcon brandKey={brandKey} payee={payee} size={24} />}
      <View style={styles.identity}>
        <View style={styles.payeeLine}>
          {/* A blank row reads as missing data; imported rows often have no
              payee, so the fallback is a dash rather than nothing. */}
          <Text style={styles.payee}>{payee || "—"}</Text>
          {isBusiness ? <Tag variant="biz">biz</Tag> : null}
          {roleTag === undefined ? null : <Tag>{roleTag}</Tag>}
        </View>
        {meta ? <Text style={styles.meta}>{meta}</Text> : null}
      </View>
      <Amount
        value={amount}
        currency={currency}
        decimals={decimals}
        size="small"
        kind={transactionType ? TRANSACTION_AMOUNT_KIND[transactionType] : "auto"}
      />
    </>
  );

  if (!onPress) {
    return <View style={styles.row}>{content}</View>;
  }

  return (
    <Animated.View style={press.style}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={payee || date}
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
  /**
   * **No separator here.** The row used to draw its own `borderBottom`, which
   * put a hairline under the *last* row of every list — a rule dangling in a
   * card's bottom padding, under nothing. A separator is a property of the gap
   * between two rows, so it belongs to whatever knows there is a next one, and
   * that is `<TransactionList>`.
   */
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: space.xl,
    paddingVertical: space.lg,
    // The floor (§10) — a pressable row's whole target, not only its
    // pressable variant, so the two never drift a pixel apart.
    minHeight: touchTarget.min,
  },
  /** Only ever applied when `onPress` is set — a plain `View` row gets neither. */
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
  /**
   * No `gap`: the two lines carry their own leading now that a step is taken
   * whole, and adding a gap on top of a line height is how a dense row grows a
   * few pixels per release until it is not dense.
   */
  identity: { flex: 1 },
  payeeLine: { flexDirection: "row", alignItems: "center", gap: space.md },
  /**
   * Medium, where the metadata under it is regular. The payee is what the eye
   * looks for when scanning a ledger — at the same weight as its own category
   * and account it is just the first of three strings.
   */
  payee: { color: theme.text, ...text.ui("bodySm", 500) },
  meta: { color: theme.textMuted, ...text.ui("caption") },
}));
