/**
 * §7, server side. One row per counterparty, per currency — never a
 * cross-currency sum, and structurally excludes contributions (§6.7) and
 * references, since only `counterparty_role = 'debt'` accrues a balance.
 */

import type { Money } from "@waltning/core/money";
import { eq, sql } from "drizzle-orm";
import type { DbHandle } from "../client.ts";
import { counterparties, transactions } from "../schema.ts";

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
 * `amount_original`/`to_amount`, coalesced with `debt_amount` when
 * `debt_currency` is set — the same substitution `debtCurrency` above makes
 * for the currency, read the other way (SPEC.md §6.6: *"where null, the
 * transaction's own currency and amount apply"*, which only makes sense if
 * the debt figure applies where it is **not** null). `debt_amount` is
 * expected null whenever `debt_currency` is, so `coalesce` alone is exactly
 * right without a `case` on `debt_currency` first: a settlement paying 50
 * EUR that discharges 214.05 PLN must subtract 214.05 from the PLN balance,
 * never the 50 that changed hands.
 */
const debtAmountOrOriginal = sql<Money>`coalesce(${transactions.debtAmount}, ${transactions.amountOriginal})`;
const debtAmountOrTo = sql<Money>`coalesce(${transactions.debtAmount}, ${transactions.toAmount})`;

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
 * otherwise `−signed(from)`, i.e. `−signedFromLeg` — both read through the
 * `debt_amount` coalesce above, never the raw column.
 */
export const debtDeltaOnCarryingLeg = sql<Money>`(
  case when ${transactions.type} = 'transfer'
    then -${debtAmountOrTo}
    else (
      case ${transactions.type}
        when 'expense' then  ${debtAmountOrOriginal}
        else                -${debtAmountOrOriginal}
      end
    )
  end
)`;

/**
 * **Archived is filtered here, in `HAVING`, after the fold — never in
 * `WHERE`.** SPEC.md: archiving hides a counterparty from pickers, but
 * *history keeps working*; `update_counterparty`'s own gate (S15 §6) refuses
 * archiving while a §7 balance is open, so an archived counterparty is
 * normally settled. A non-zero balance under one — e.g. one archived before
 * this coalesce fix landed — is still history that must be seen, which a
 * blanket `WHERE archived = false` cannot express: it can only see the raw
 * row, never the sum this query folds it into.
 */
export async function counterpartyBalances(db: DbHandle): Promise<CounterpartyBalanceRow[]> {
  const balance = sql<Money>`sum(${debtDeltaOnCarryingLeg})::numeric(20,8)::text`;
  const rows = await db
    .select({
      counterpartyId: sql<string>`${transactions.counterpartyId}`,
      currency: debtCurrency,
      balance,
    })
    .from(transactions)
    .innerJoin(counterparties, eq(transactions.counterpartyId, counterparties.id))
    .where(
      sql`${transactions.counterpartyId} is not null and ${transactions.counterpartyRole} = 'debt' and ${live}`,
    )
    .groupBy(transactions.counterpartyId, debtCurrency, counterparties.archived)
    .having(sql`not (${counterparties.archived} and sum(${debtDeltaOnCarryingLeg}) = 0)`)
    .orderBy(transactions.counterpartyId, debtCurrency);
  return rows;
}
