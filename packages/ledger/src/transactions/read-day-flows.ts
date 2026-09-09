/**
 * §5's figure cut by day, phone side — S04's calendar.
 *
 * **The same query as `readPeriodSpend`, folded one bucket deeper.** It has to
 * be: the calendar's marks and the month card above them are one answer to §5,
 * and two answers on one screen is what two queries produce. The join, the
 * ownership filter and the period bound are all read from that read, and the
 * fold itself is `money.dayFlows` — which is `periodSpend` with the day in the
 * key.
 *
 * **A month, not a page.** This is bounded by the period rather than by a row
 * count, because a calendar cannot be paged — a grid missing its 30th day
 * because the page ended at 29 would be a silently wrong picture rather than a
 * short list. A month of a real ledger is hundreds of rows, not the 25k the
 * whole ledger holds, so the bound is the reason this is safe at Pi scale.
 */

import * as money from "@waltning/core/money";
import { and, eq, gte, inArray, isNull, lt } from "drizzle-orm";
import type { ReplicaDb } from "../open.ts";
import { ledgerSchema } from "../schema-map.ts";

const { accounts, currencies, transactions } = ledgerSchema;

export function readDayFlows<TRun, TSchema extends typeof ledgerSchema>(
  db: ReplicaDb<TRun, TSchema>,
  period: money.Period,
): readonly money.DayFlowRow[] {
  const rows = db
    .select({
      type: transactions.type,
      date: transactions.date,
      ownership: accounts.ownership,
      currency: transactions.currency,
      decimals: currencies.decimals,
      amountOriginal: transactions.amountOriginal,
    })
    .from(transactions)
    .innerJoin(accounts, eq(transactions.accountId, accounts.id))
    .innerJoin(currencies, eq(transactions.currency, currencies.code))
    .where(
      and(
        isNull(transactions.deletedAt),
        inArray(transactions.type, ["income", "expense"]),
        gte(transactions.date, period.start),
        lt(transactions.date, period.end),
      ),
    )
    .all();

  return money.dayFlows(rows, period);
}
