/**
 * `readContextRows` — the rows behind S09's *Who* and *Pair* cards
 * (`computations.md` §6a), and nothing else about them.
 *
 * **One query, no totals, no paging.** The cards first read through
 * `searchTransactions`, whose every page re-folds the running total over the
 * whole matching set — forty pages of a busy account meant forty full folds,
 * synchronously, on every sync. The cards need four columns and sum them
 * themselves, so this is the four columns.
 *
 * **One-offs are returned, flagged.** §5 says a comparison that leaves them
 * out states it; the caller can only state it if it can see them.
 */

import type { AccountingDate } from "@waltning/core/date";
import type { Id } from "@waltning/core/id";
import type { CurrencyCode, Money } from "@waltning/core/money";
import { and, eq, gte, isNull, lte } from "drizzle-orm";
import type { ReplicaDb } from "../open.ts";
import { ledgerSchema } from "../schema-map.ts";

const { transactions } = ledgerSchema;

export type ContextRowsQuery = {
  currency: CurrencyCode;
  from: AccountingDate;
  to: AccountingDate;
} & (
  | {
      kind: "who";
      /** The identity link only — who it was *with* (§6.6.1), never who owes. */
      counterpartyId: Id<"counterparties">;
      type: "expense" | "income";
    }
  | { kind: "pair"; accountId: Id<"accounts">; toAccountId: Id<"accounts"> }
);

export type ContextRow = {
  id: Id<"transactions">;
  date: AccountingDate;
  /** The unsigned magnitude the row was captured with. */
  amountOriginal: Money;
  isCapital: boolean;
};

export function readContextRows<TRun, TSchema extends typeof ledgerSchema>(
  db: ReplicaDb<TRun, TSchema>,
  query: ContextRowsQuery,
): readonly ContextRow[] {
  const which =
    query.kind === "who"
      ? and(
          eq(transactions.counterpartyId, query.counterpartyId),
          eq(transactions.type, query.type),
        )
      : and(
          eq(transactions.type, "transfer"),
          eq(transactions.accountId, query.accountId),
          eq(transactions.toAccountId, query.toAccountId),
        );
  return db
    .select({
      id: transactions.id,
      date: transactions.date,
      amountOriginal: transactions.amountOriginal,
      isCapital: transactions.isCapital,
    })
    .from(transactions)
    .where(
      and(
        isNull(transactions.deletedAt),
        eq(transactions.currency, query.currency),
        gte(transactions.date, query.from),
        lte(transactions.date, query.to),
        which,
      ),
    )
    .all();
}
