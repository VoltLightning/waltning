/**
 * S09's context cards — `computations.md` §6a, class **R**.
 *
 * **Six months ending with the transaction's own month**, never the
 * calendar's: opening a March coffee in September shows March in context.
 * Every figure is in the transaction's own currency and never sums across
 * currencies (§6's reason).
 *
 * **One-offs are left out of every figure** (§5: a comparison excludes
 * `is_capital`). When the transaction itself is one, its `share` is `null`
 * and the card says why instead of drawing a slice it did not contribute.
 *
 * Plain reads over the replica, synchronous, no conversion — so nothing here
 * waits on a rate and nothing is wrong offline.
 */

import {
  type AccountingDate,
  monthRange,
  shiftMonth,
  type YearMonth,
  yearMonth,
} from "@waltning/core/date";
import type { Id } from "@waltning/core/id";
import type { CurrencyCode, Money } from "@waltning/core/money";
import * as money from "@waltning/core/money";
import type {
  PhoneLedgerController,
  PhoneSearchFilter,
  PhoneSearchTransaction,
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
  /** `null` when the transaction is a one-off, and so counted nowhere here. */
  share: Money | null;
};

/** How often, and how much — six months of one counterparty (§6a *Who*). */
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
  "searchTransactions" | "readSpendByCategory"
>;

type Subject = Pick<
  PhoneTransactionDetail,
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
  | "lines"
>;

/** The cards S09 §3's table names for this transaction, in order. */
export function readTransactionContext(
  ledger: TransactionContextLedger,
  subject: Subject,
): readonly TransactionContextCard[] {
  const month = yearMonth(subject.date.slice(0, 7));
  const base = {
    currency: subject.currency,
    decimals: subject.decimals,
    share: subject.isCapital ? null : money.abs(subject.amount),
  };

  if (subject.type === "transfer") {
    if (subject.toAccountId === null) return [];
    const to = subject.toAccountId;
    const rows = readWindow(ledger, month, {
      accountIds: [subject.accountId],
      currency: subject.currency,
    }).filter(
      (row) =>
        row.type === "transfer" && row.accountId === subject.accountId && row.toAccountId === to,
    );
    return [{ kind: "pair", toAccountId: to, ...byMonth(rows, month), ...base }];
  }
  if (subject.type !== "expense" && subject.type !== "income") return [];

  const cards: TransactionContextCard[] = [];
  if (subject.counterpartyId === null) {
    cards.push({ kind: "link" });
  } else {
    const rows = readWindow(ledger, month, {
      involvesCounterpartyId: subject.counterpartyId,
      currency: subject.currency,
    }).filter((row) => row.type === subject.type && row.currency === subject.currency);
    cards.push({
      kind: "who",
      counterpartyId: subject.counterpartyId,
      ...byMonth(rows, month),
      ...base,
    });
  }

  if (subject.type === "expense" && subject.categoryId !== null) {
    cards.push(readCategory(ledger, subject, subject.categoryId, month, base));
  }
  return cards;
}

/** Every page of one six-month window, one-offs left out. */
function readWindow(
  ledger: TransactionContextLedger,
  month: YearMonth,
  filter: PhoneSearchFilter,
): PhoneSearchTransaction[] {
  const window = {
    ...filter,
    from: monthRange(shiftMonth(month, 1 - CONTEXT_MONTHS)).from,
    to: monthRange(month).to,
  };
  const rows: PhoneSearchTransaction[] = [];
  let page = ledger.searchTransactions(window);
  rows.push(...page.rows);
  while (page.nextCursor !== undefined) {
    page = ledger.searchTransactions(window, page.nextCursor);
    rows.push(...page.rows);
  }
  return rows.filter((row) => !row.isCapital);
}

function byMonth(
  rows: readonly PhoneSearchTransaction[],
  month: YearMonth,
): { months: ContextMonth[]; count: number } {
  const months: ContextMonth[] = [];
  for (let back = CONTEXT_MONTHS - 1; back >= 0; back--) {
    months.push({ month: shiftMonth(month, -back), total: money.ZERO });
  }
  let count = 0;
  for (const row of rows) {
    const slot = months.find((entry) => row.date.startsWith(entry.month));
    if (slot === undefined) continue;
    slot.total = money.add(slot.total, money.abs(row.amount));
    if (slot.month === month) count += 1;
  }
  return { months, count };
}

function readCategory(
  ledger: TransactionContextLedger,
  subject: Subject,
  categoryId: Id<"categories">,
  month: YearMonth,
  base: Figures,
): CategoryContext {
  const spentIn = (m: YearMonth): Money => {
    const { from } = monthRange(m);
    const end: AccountingDate = monthRange(shiftMonth(m, 1)).from;
    let total = money.ZERO;
    for (const row of ledger.readSpendByCategory({ start: from, end }, "all", {
      excludeCapital: true,
    })) {
      if (row.categoryId === categoryId && row.currency === subject.currency) {
        total = money.add(total, row.amount);
      }
    }
    return total;
  };

  let usualSum = money.ZERO;
  let usualMonths = 0;
  for (let back = 1; back <= USUAL_MONTHS; back++) {
    const spent = spentIn(shiftMonth(month, -back));
    if (!money.isPositive(spent)) continue;
    usualSum = money.add(usualSum, spent);
    usualMonths += 1;
  }

  // §6's attribution: lines win where they exist, so a lined transaction
  // contributes only its lines in this category.
  let share = base.share;
  if (share !== null && subject.lines.length > 0) {
    share = subject.lines
      .filter((line) => line.categoryId === categoryId)
      .reduce((sum, line) => money.add(sum, money.abs(line.amount)), money.ZERO);
  }

  return {
    kind: "category",
    categoryId,
    month,
    spent: spentIn(month),
    usual: usualMonths === 0 ? null : money.toMoney(money.dec(usualSum).div(usualMonths)),
    ...base,
    share,
  };
}
