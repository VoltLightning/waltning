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
 */

import type * as money from "@waltning/core/money";
import { Text, View } from "react-native";
import { Amount, type AmountKind } from "../fx/amount";
import { Tag } from "../primitives/tag";
import { text } from "../theme/fonts.ts";
import { makeStyles } from "../theme/styles.ts";
import { space, tabularNums } from "../tokens.ts";

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
};

const KIND: Record<TransactionType, AmountKind> = {
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
}: TransactionRowProps) {
  const meta = [account, category].filter(Boolean).join(" · ");

  const styles = useStyles();

  return (
    <View style={styles.row}>
      {/*
        The bare accounting date. These are `YYYY-MM-DD` strings, not moments —
        rendering one through a `Date` is how a capture lands on the wrong day
        when the phone is still on the previous timezone (C28).
      */}
      <Text style={styles.date}>{date.slice(5)}</Text>
      <View style={styles.identity}>
        <View style={styles.payeeLine}>
          {/* A blank row reads as missing data; imported rows often have no
              payee, so the fallback is a dash rather than nothing. */}
          <Text style={styles.payee}>{payee || "—"}</Text>
          {isBusiness ? <Tag variant="biz">biz</Tag> : null}
        </View>
        {meta ? <Text style={styles.meta}>{meta}</Text> : null}
      </View>
      <Amount
        value={amount}
        currency={currency}
        decimals={decimals}
        size="small"
        kind={transactionType ? KIND[transactionType] : "auto"}
      />
    </View>
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
