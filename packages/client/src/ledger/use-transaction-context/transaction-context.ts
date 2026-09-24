/**
 * S09's context cards — `computations.md` §6a, class **R**.
 *
 * **Six months ending with the transaction's own month**, never the
 * calendar's: opening a March coffee in September shows March in context.
 * Every figure is in the transaction's own currency and never sums across
 * currencies (§6's reason).
 *
 * **One-offs are left out of every figure** (§5: a comparison excludes
 * `is_capital`), and each card says so: `oneOffsLeftOut` when any other row
 * was dropped, `ownOneOff` when this one was — its `share` is then `null`
 * rather than a slice it did not contribute.
 *
 * **The share comes from the same read as the bars.** *Who* and *Pair* take
 * it from the window's own row for this transaction, and *Category* from §6's
 * fold run over this transaction alone — so a share can never be a different
 * moment, or a different sum, from the bar it is drawn inside.
 *
 * Plain reads over the replica, synchronous, no conversion — so nothing here
 * waits on a rate and nothing is wrong offline.
 */

import {
  type AccountingDate,
  addDays,
  monthRange,
  shiftMonth,
  type YearMonth,
  yearMonth,
} from "@waltning/core/date";
import type { Id } from "@waltning/core/id";
import type { CurrencyCode, Money } from "@waltning/core/money";
import * as money from "@waltning/core/money";
import type {
  PhoneContextRow,
  PhoneContextRowsQuery,
  PhoneLedgerController,
  PhoneTransactionDetail,
} from "../create-phone-ledger/create-phone-ledger.ts";

/** How many months a *Who* or *Pair* card draws, the transaction's own last. */
export const CONTEXT_MONTHS = 6;
/** S05's pace rule — the mean of the previous three months that held anything. */
const USUAL_MONTHS = 3;

export type ContextMonth = { month: YearMonth; total: Money };

type Figures = {
  currency: CurrencyCode;
  decimals: number;
  /** This transaction's part of its own month; `null` when it counts nowhere. */
  share: Money | null;
  /** This transaction is a one-off, and so left out of every figure here. */
  ownOneOff: boolean;
  /** Some other row in the figures was a one-off and was left out (§5). */
  oneOffsLeftOut: boolean;
};

/** How often, and how much — six months with one counterparty (§6a *Who*). */
export type WhoContext = Figures & {
  kind: "who";
  counterpartyId: Id<"counterparties">;
  months: readonly ContextMonth[];
  /** Rows in the transaction's own month. */
  count: number;
};

/** The same question for a move between two of your own accounts (§6a *Pair*). */
export type PairContext = Figures & {
  kind: "pair";
  toAccountId: Id<"accounts">;
  months: readonly ContextMonth[];
  count: number;
};

/** Is this a lot — the month in one category against the usual (§6a *Category*). */
export type CategoryContext = Figures & {
  kind: "category";
  categoryId: Id<"categories">;
  month: YearMonth;
  spent: Money;
  /** `null` with no earlier month to measure against. */
  usual: Money | null;
};

/** No counterparty yet — the card offers to link one rather than showing nothing. */
export type LinkContext = { kind: "link" };

export type TransactionContextCard = WhoContext | PairContext | CategoryContext | LinkContext;

export type TransactionContextLedger = Pick<
  PhoneLedgerController,
  "readContextRows" | "readSpendByCategory"
>;

type Subject = Pick<
  PhoneTransactionDetail,
  | "id"
  | "type"
  | "date"
  | "amount"
  | "currency"
  | "decimals"
  | "isCapital"
  | "counterpartyId"
  | "categoryId"
  | "accountId"
  | "toAccountId"
  | "isBusiness"
  | "lines"
>;

/** The cards S09 §3's table names for this transaction, in order. */
export function readTransactionContext(
  ledger: TransactionContextLedger,
  subject: Subject,
): readonly TransactionContextCard[] {
  const month = yearMonth(subject.date.slice(0, 7));
  const window = {
    currency: subject.currency,
    from: monthRange(shiftMonth(month, 1 - CONTEXT_MONTHS)).from,
    to: monthRange(month).to,
  };
  const figures = { currency: subject.currency, decimals: subject.decimals };

  if (subject.type === "transfer") {
    if (subject.toAccountId === null) return [];
    const rows = ledger.readContextRows({
      ...window,
      kind: "pair",
      accountId: subject.accountId,
      toAccountId: subject.toAccountId,
    });
    return [
      {
        kind: "pair",
        toAccountId: subject.toAccountId,
        ...figures,
        ...byMonth(rows, month, subject.id),
      },
    ];
  }
  if (subject.type !== "expense" && subject.type !== "income") return [];

  const cards: TransactionContextCard[] = [];
  if (subject.counterpartyId === null) {
    cards.push({ kind: "link" });
  } else {
    const query: PhoneContextRowsQuery = {
      ...window,
      kind: "who",
      counterpartyId: subject.counterpartyId,
      type: subject.type,
    };
    cards.push({
      kind: "who",
      counterpartyId: subject.counterpartyId,
      ...figures,
      ...byMonth(ledger.readContextRows(query), month, subject.id),
    });
  }

  if (subject.type === "expense") {
    const category = cardCategory(subject);
    if (category !== null) cards.push(readCategory(ledger, subject, category, month));
  }
  return cards;
}

/**
 * Six months of totals, one-offs left out and counted; the share is this
 * transaction's own row in the same read — absent from it (deleted since), and
 * there is nothing to draw.
 */
function byMonth(
  rows: readonly PhoneContextRow[],
  month: YearMonth,
  self: Id<"transactions">,
): Pick<WhoContext, "months" | "count" | "share" | "ownOneOff" | "oneOffsLeftOut"> {
  const months: ContextMonth[] = [];
  for (let back = CONTEXT_MONTHS - 1; back >= 0; back--) {
    months.push({ month: shiftMonth(month, -back), total: money.ZERO });
  }
  let count = 0;
  let share: Money | null = null;
  let ownOneOff = false;
  let oneOffsLeftOut = false;
  for (const row of rows) {
    if (row.isCapital) {
      if (row.id === self) ownOneOff = true;
      else oneOffsLeftOut = true;
      continue;
    }
    const slot = months.find((entry) => row.date.startsWith(entry.month));
    if (slot === undefined) continue;
    const amount = money.abs(row.amountOriginal);
    slot.total = money.add(slot.total, amount);
    if (slot.month === month) count += 1;
    if (row.id === self) share = amount;
  }
  return { months, count, share, ownOneOff, oneOffsLeftOut };
}

/**
 * The category the card is about. §6 reads a lined transaction through its
 * lines and ignores its own category, so the card does too: its own category
 * when a line carries it, else the category its lines put the most into.
 */
function cardCategory(subject: Subject): Id<"categories"> | null {
  if (subject.lines.length === 0) return subject.categoryId;
  if (subject.lines.some((line) => line.categoryId === subject.categoryId)) {
    return subject.categoryId;
  }
  let best: { id: Id<"categories">; amount: Money } | null = null;
  for (const row of attributionOf(subject)) {
    if (row.categoryId === null || !money.isPositive(row.amount)) continue;
    if (best === null || money.dec(row.amount).greaterThan(best.amount)) {
      best = { id: row.categoryId as Id<"categories">, amount: row.amount };
    }
  }
  return best?.id ?? null;
}

/** §6's own fold over this one transaction — signed lines and all. */
function attributionOf(subject: Subject): readonly money.SpendByCategoryRow[] {
  const id = String(subject.id);
  return money.spendByCategory(
    [
      {
        id,
        type: "expense",
        date: subject.date,
        ownership: "own",
        isBusiness: subject.isBusiness,
        currency: subject.currency,
        decimals: subject.decimals,
        categoryId: subject.categoryId,
        amountOriginal: money.abs(subject.amount),
        isCapital: false,
      },
    ],
    subject.lines.map((line) => ({
      transactionId: id,
      categoryId: line.categoryId,
      amount: line.amount,
    })),
    { start: subject.date, end: addDays(subject.date, 1) },
    "all",
  );
}

function readCategory(
  ledger: TransactionContextLedger,
  subject: Subject,
  categoryId: Id<"categories">,
  month: YearMonth,
): CategoryContext {
  const spentIn = (m: YearMonth, excludeCapital: boolean): Money => {
    const { from } = monthRange(m);
    const end: AccountingDate = monthRange(shiftMonth(m, 1)).from;
    const rows = excludeCapital
      ? ledger.readSpendByCategory({ start: from, end }, "all", { excludeCapital: true })
      : ledger.readSpendByCategory({ start: from, end }, "all");
    let total = money.ZERO;
    for (const row of rows) {
      if (row.categoryId === categoryId && row.currency === subject.currency) {
        total = money.add(total, row.amount);
      }
    }
    return total;
  };

  let usualSum = money.ZERO;
  let usualMonths = 0;
  for (let back = 1; back <= USUAL_MONTHS; back++) {
    const spent = spentIn(shiftMonth(month, -back), true);
    if (!money.isPositive(spent)) continue;
    usualSum = money.add(usualSum, spent);
    usualMonths += 1;
  }

  const spent = spentIn(month, true);
  const own = attributionOf(subject).find((row) => row.categoryId === categoryId)?.amount;
  const share = subject.isCapital || own === undefined || !money.isPositive(own) ? null : own;

  return {
    kind: "category",
    categoryId,
    month,
    spent,
    usual: usualMonths === 0 ? null : money.toMoney(money.dec(usualSum).div(usualMonths)),
    currency: subject.currency,
    decimals: subject.decimals,
    share,
    ownOneOff: subject.isCapital,
    // §5 — the month's own figure with one-offs in, against the one drawn.
    oneOffsLeftOut: money
      .dec(spentIn(month, false))
      .minus(spent)
      .minus(subject.isCapital ? (own ?? "0") : "0")
      .abs()
      .greaterThan(0),
  };
}
