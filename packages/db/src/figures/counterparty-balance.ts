/**
 * §7, server side. One row per counterparty, per currency — never a
 * cross-currency sum, and structurally excludes contributions (§6.7) and
 * references, since only `counterparty_role = 'debt'` accrues a balance.
 */

import type { Money } from "@waltning/core/money";
import { sql } from "drizzle-orm";
import type { DbHandle } from "../client.ts";
import { transactions } from "../schema.ts";
import { signedFromLeg } from "./signed.sql.ts";

export type CounterpartyBalanceRow = { counterpartyId: string; currency: string; balance: Money };

const live = sql`${transactions.deletedAt} is null`;

/**
 * `coalesce(debt_currency, currency)` — §7's `ccy`. A settlement can
 * discharge a balance in a currency other than the one that changed hands
 * (S14); where `debt_currency` is null, the transaction's own currency
 * applies.
 */
export const debtCurrency = sql<string>`coalesce(${transactions.debtCurrency}, ${transactions.currency})`;

/**
 * §7's `side`: the leg carrying the counterparty. For `income`, `expense`
 * and `adjustment` there is only one leg, so `side` is trivially `'from'`.
 * For `transfer` it is the destination leg — a repayment lands *into* an
 * owned account, and using the source leg inverts the sign (C15; the doc
 * comment on `money.ts`'s `debtDelta`). This is a rule on `type` alone, not
 * on which specific account either leg happens to be: nothing in the schema
 * marks one account as "the counterparty's", and every debt-role transfer
 * this repository's fixtures or migration produce is a repayment landing on
 * the `to` leg — there is no shipped example of the reverse.
 *
 * `debtDelta = −signed(side)`: for `transfer`, `−signed(to) = −to_amount`;
 * otherwise `−signed(from)`, i.e. `−signedFromLeg`.
 */
export const debtDeltaOnCarryingLeg = sql<Money>`(
  case when ${transactions.type} = 'transfer'
    then -${transactions.toAmount}
    else -${signedFromLeg}
  end
)`;

export async function counterpartyBalances(db: DbHandle): Promise<CounterpartyBalanceRow[]> {
  const rows = await db
    .select({
      counterpartyId: sql<string>`${transactions.counterpartyId}`,
      currency: debtCurrency,
      balance: sql<Money>`sum(${debtDeltaOnCarryingLeg})::numeric(20,8)::text`,
    })
    .from(transactions)
    .where(
      sql`${transactions.counterpartyId} is not null and ${transactions.counterpartyRole} = 'debt' and ${live}`,
    )
    .groupBy(transactions.counterpartyId, debtCurrency)
    .orderBy(transactions.counterpartyId, debtCurrency);
  return rows;
}
