/**
 * §3, server side. A sum of §2 balances grouped by currency and split by
 * ownership — never a cross-currency sum, and business accounts are in
 * `mine` (the scope partition is a transaction filter, not a balance one).
 *
 * **`loan_receivable` is excluded**, matching `@waltning/ledger`'s
 * `readAccountsForNetWorth`. §3: *"Receivables are excluded — lending is an
 * expense and repayment an unearned inflow (§6.6). Net worth is money you
 * hold."* The lent amount already left a real account as an ordinary
 * expense; counting the `loan_receivable` balance too would hold the same
 * money twice. `loan_payable` stays in — a debt you owe is a real liability.
 */

import type { Money } from "@waltning/core/money";
import { and, getTableName, ne, sql } from "drizzle-orm";
import type { DbHandle } from "../client.ts";
import { accounts, transactions } from "../schema.ts";
import { signedFromLeg } from "./signed.sql.ts";

export type NetWorthRow = { currency: string; mine: Money; ours: Money };

const live = sql`${transactions.deletedAt} is null`;

/**
 * `accounts.id`, always qualified — defensively.
 *
 * Whether drizzle prefixes `accounts.id` with its table name here turns out
 * to depend on exactly which columns the enclosing `.select()` also asks
 * for, not on the number of tables in scope: `differential.test.ts`'s
 * `sqlBalance` — the same correlated-subquery shape as `balance` below,
 * `.from(accounts)` with no join, selecting a bare `id: accounts.id`
 * alongside it — renders that `WHERE account_id = id` as bare `"id"`, which
 * resolves to `transactions.id` inside the subquery (it has one too), not
 * the outer row. `WHERE account_id = id` is then never true: every sum
 * coalesces to 0 and the balance comes back as the opening balance alone.
 * This function's own `.select()` never asks for a bare `accounts.id`
 * column and was not reproduced broken by hand — but the trigger is this
 * fragile to an unrelated field being added to the same query later, so
 * this is qualified explicitly rather than relying on it.
 */
const accountId = sql.raw(`"${getTableName(accounts)}"."id"`);

const balance = sql<Money>`(
  ${accounts.openingBalance}
  + coalesce((select sum(${signedFromLeg}) from ${transactions}
              where ${transactions.accountId} = ${accountId} and ${live}), 0)
  + coalesce((select sum(${transactions.toAmount}) from ${transactions}
              where ${transactions.toAccountId} = ${accountId} and ${live}), 0)
)`;

export async function netWorth(db: DbHandle): Promise<NetWorthRow[]> {
  const rows = await db
    .select({
      currency: accounts.currency,
      mine: sql<Money>`sum(case when ${accounts.ownership} = 'own' then ${balance} else 0 end)::numeric(20,8)::text`,
      ours: sql<Money>`sum(${balance})::numeric(20,8)::text`,
    })
    .from(accounts)
    .where(and(sql`${accounts.archived} = false`, ne(accounts.kind, "loan_receivable")))
    .groupBy(accounts.currency)
    .orderBy(accounts.currency);
  return rows;
}
