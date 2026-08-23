import type { Id } from "@waltning/core/id";
import type { CurrencyCode, Money } from "@waltning/core/money";
import * as money from "@waltning/core/money";
import type { AccountKind } from "@waltning/core/registry/inputs";
import { and, asc, eq, inArray, isNull, or } from "drizzle-orm";
import type { ReplicaDb } from "../open.ts";
import { ledgerSchema } from "../schema-map.ts";

const { accounts, currencies, transactions } = ledgerSchema;

export type LocalAccountSummary = {
  id: Id<"accounts">;
  name: string;
  kind: AccountKind;
  currency: CurrencyCode;
  decimals: number;
  balance: Money;
};

export function readAccounts<TRun, TSchema extends typeof ledgerSchema>(
  db: ReplicaDb<TRun, TSchema>,
): readonly LocalAccountSummary[] {
  const active = db
    .select({
      id: accounts.id,
      name: accounts.name,
      kind: accounts.kind,
      currency: accounts.currency,
      decimals: currencies.decimals,
      openingBalance: accounts.openingBalance,
      sort: accounts.sort,
    })
    .from(accounts)
    .innerJoin(currencies, eq(accounts.currency, currencies.code))
    .where(eq(accounts.archived, false))
    .orderBy(asc(accounts.sort), asc(accounts.name), asc(accounts.id))
    .all();

  const activeIds = new Set(active.map((account) => account.id));
  const balances = new Map<Id<"accounts">, Money>(
    active.map((account) => [account.id, account.openingBalance]),
  );

  if (activeIds.size > 0) {
    const rows = db
      .select({
        type: transactions.type,
        accountId: transactions.accountId,
        toAccountId: transactions.toAccountId,
        amountOriginal: transactions.amountOriginal,
        toAmount: transactions.toAmount,
      })
      .from(transactions)
      .where(
        and(
          isNull(transactions.deletedAt),
          or(
            inArray(transactions.accountId, [...activeIds]),
            inArray(transactions.toAccountId, [...activeIds]),
          ),
        ),
      )
      .all();

    for (const transaction of rows) {
      if (activeIds.has(transaction.accountId)) {
        const prior = balances.get(transaction.accountId);
        if (prior !== undefined) {
          balances.set(transaction.accountId, money.add(prior, money.signed(transaction, "from")));
        }
      }

      if (transaction.toAccountId !== null && activeIds.has(transaction.toAccountId)) {
        const prior = balances.get(transaction.toAccountId);
        if (prior !== undefined) {
          balances.set(transaction.toAccountId, money.add(prior, money.signed(transaction, "to")));
        }
      }
    }
  }

  return active.map(({ openingBalance: _openingBalance, sort: _sort, ...account }) => {
    const balance = balances.get(account.id);
    if (balance === undefined) {
      throw new Error(`the balance fold was not initialized for account ${account.id}`);
    }
    return { ...account, balance };
  });
}
