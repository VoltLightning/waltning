/**
 * §7's fold, over the live replica — `readCounterpartyBalances` (E1) is a
 * parallel PR not on this base; this is the query it will replace, shared
 * between `update_counterparty`'s archive gate and `settle_debt`'s read
 * rather than duplicated between them, since a fold two callers need
 * identically is precisely the case worth naming once.
 *
 * `side` is `'to'` for a transfer, `'from'` otherwise (`computations.md`
 * §7). `currency` is `coalesce(debt_currency, currency)`, and — the same
 * coalesce, read the other way — when `debt_currency` is set, `debt_amount`
 * values the row instead of `amount_original`/`to_amount`: SPEC.md §6.6 says
 * *"where null, the transaction's own currency and amount apply"*, which
 * only makes sense if the debt figure applies where it is **not** null,
 * since that is the one already denominated in the currency the balance
 * buckets by.
 */

import type { Id } from "@waltning/core/id";
import * as money from "@waltning/core/money";
import { and, eq, isNull } from "drizzle-orm";
import { ledgerSchema as schema } from "../schema-map.ts";
import type { LocalTx } from "../write.ts";

const { transactions } = schema;
type ReplicaTx = LocalTx<unknown, typeof schema>;

export function openBalances(
  tx: ReplicaTx,
  counterpartyId: Id<"counterparties">,
): readonly money.CounterpartyBalanceRow[] {
  const rows = tx
    .select({
      type: transactions.type,
      amountOriginal: transactions.amountOriginal,
      toAmount: transactions.toAmount,
      currency: transactions.currency,
      debtCurrency: transactions.debtCurrency,
      debtAmount: transactions.debtAmount,
    })
    .from(transactions)
    .where(
      and(
        isNull(transactions.deletedAt),
        eq(transactions.counterpartyId, counterpartyId),
        eq(transactions.counterpartyRole, "debt"),
      ),
    )
    .all();

  return money.counterpartyBalance(
    rows.map((row) => {
      const value = row.debtCurrency !== null ? (row.debtAmount ?? row.amountOriginal) : null;
      return {
        type: row.type,
        amountOriginal: value ?? row.amountOriginal,
        toAmount: value ?? row.toAmount,
        side: row.type === "transfer" ? ("to" as const) : ("from" as const),
        currency: row.debtCurrency ?? row.currency,
      };
    }),
  );
}
