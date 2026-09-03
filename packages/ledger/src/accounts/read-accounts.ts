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

export type LocalAccountForNetWorth = LocalAccountSummary & { ownership: "own" | "shared" };

/** Every active account with its ownership — what §3 needs and the summary does not carry. */
export function readAccountsForNetWorth<TRun, TSchema extends typeof ledgerSchema>(
  db: ReplicaDb<TRun, TSchema>,
): readonly LocalAccountForNetWorth[] {
  const active = db
    .select({
      id: accounts.id,
      name: accounts.name,
      kind: accounts.kind,
      currency: accounts.currency,
      decimals: currencies.decimals,
      ownership: accounts.ownership,
      openingBalance: accounts.openingBalance,
      sort: accounts.sort,
    })
    .from(accounts)
    .innerJoin(currencies, eq(accounts.currency, currencies.code))
    .where(eq(accounts.archived, false))
    .orderBy(asc(accounts.sort), asc(accounts.name), asc(accounts.id))
    .all();

  const activeIds = new Set(active.map((account) => account.id));

  const rows =
    activeIds.size > 0
      ? db
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
          .all()
      : [];

  return active.map(({ openingBalance, sort: _sort, ...account }) => ({
    ...account,
    // §2, through the one fold the phone and the differential test share.
    balance: money.accountBalance(openingBalance, account.id, rows),
  }));
}

export function readAccounts<TRun, TSchema extends typeof ledgerSchema>(
  db: ReplicaDb<TRun, TSchema>,
): readonly LocalAccountSummary[] {
  return readAccountsForNetWorth(db).map(({ ownership: _ownership, ...rest }) => rest);
}
