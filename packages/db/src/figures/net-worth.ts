/**
 * §3, server side. A sum of §2 balances grouped by currency and split by
 * ownership — never a cross-currency sum, and business accounts are in
 * `mine` (the scope partition is a transaction filter, not a balance one).
 */

import type { Money } from "@waltning/core/money";
import { sql } from "drizzle-orm";
import type { DbHandle } from "../client.ts";
import { accounts, transactions } from "../schema.ts";
import { signedFromLeg } from "./signed.sql.ts";

export type NetWorthRow = { currency: string; mine: Money; ours: Money };

const live = sql`${transactions.deletedAt} is null`;

const balance = sql<Money>`(
  ${accounts.openingBalance}
  + coalesce((select sum(${signedFromLeg}) from ${transactions}
              where ${transactions.accountId} = ${accounts.id} and ${live}), 0)
  + coalesce((select sum(${transactions.toAmount}) from ${transactions}
              where ${transactions.toAccountId} = ${accounts.id} and ${live}), 0)
)`;

export async function netWorth(db: DbHandle): Promise<NetWorthRow[]> {
  const rows = await db
    .select({
      currency: accounts.currency,
      mine: sql<Money>`sum(case when ${accounts.ownership} = 'own' then ${balance} else 0 end)::numeric(20,8)::text`,
      ours: sql<Money>`sum(${balance})::numeric(20,8)::text`,
    })
    .from(accounts)
    .where(sql`${accounts.archived} = false`)
    .groupBy(accounts.currency)
    .orderBy(accounts.currency);
  return rows;
}
