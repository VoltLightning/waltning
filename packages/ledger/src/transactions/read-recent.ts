import type { AccountingDate } from "@waltning/core/date";
import type { Id } from "@waltning/core/id";
import type { CurrencyCode, Money } from "@waltning/core/money";
import * as money from "@waltning/core/money";
import { desc, eq, isNull } from "drizzle-orm";
import type { ReplicaDb } from "../open.ts";
import { ledgerSchema } from "../schema-map.ts";

const { accounts, categories, currencies, transactions } = ledgerSchema;

export type LocalRecentTransaction = {
  id: Id<"transactions">;
  date: AccountingDate;
  payee: string;
  categoryName: string | null;
  accountName: string;
  amount: Money;
  currency: CurrencyCode;
  decimals: number;
  isBusiness: boolean;
};

export function readRecent<TRun, TSchema extends typeof ledgerSchema>(
  db: ReplicaDb<TRun, TSchema>,
  limit: number,
): readonly LocalRecentTransaction[] {
  if (!Number.isInteger(limit) || limit < 0) {
    throw new Error(`recent transaction limit must be a non-negative integer, got ${limit}`);
  }

  return db
    .select({
      id: transactions.id,
      date: transactions.date,
      payee: transactions.payee,
      categoryName: categories.name,
      accountName: accounts.name,
      type: transactions.type,
      amountOriginal: transactions.amountOriginal,
      toAmount: transactions.toAmount,
      currency: transactions.currency,
      decimals: currencies.decimals,
      isBusiness: transactions.isBusiness,
    })
    .from(transactions)
    .innerJoin(accounts, eq(transactions.accountId, accounts.id))
    .innerJoin(currencies, eq(transactions.currency, currencies.code))
    .leftJoin(categories, eq(transactions.categoryId, categories.id))
    .where(isNull(transactions.deletedAt))
    .orderBy(desc(transactions.date), desc(transactions.createdAt), desc(transactions.id))
    .limit(limit)
    .all()
    .map(({ type, amountOriginal, toAmount, ...row }) => ({
      ...row,
      amount: money.signed({ type, amountOriginal, toAmount }, "from"),
    }));
}
