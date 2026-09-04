/**
 * §7's `counterparty_balances`, on the phone — the read half the shared plan
 * closes. Class **F** per currency, class **R** for ageing
 * (`computations.md` §0: reclassified from **S** now the replica holds the
 * whole history, not a window).
 *
 * One row per counterparty per currency, resolving `side` (`'to'` for a
 * transfer, `'from'` otherwise — §7's rule verbatim, the same one
 * `packages/db/src/figures/counterparty-balance.ts` states in SQL) and
 * `coalesce(debt_currency, currency)` in application code, then folding with
 * `money.counterpartyBalance`. Ageing — **companies only** (O15) — runs
 * `money.fifoOldestOpen` over that counterparty's own rows in that currency.
 */

import type { AccountingDate } from "@waltning/core/date";
import type { Id } from "@waltning/core/id";
import type { CurrencyCode, Money } from "@waltning/core/money";
import * as money from "@waltning/core/money";
import type { CounterpartyKind } from "@waltning/schema/enums";
import { and, eq, isNull } from "drizzle-orm";
import type { ReplicaDb } from "../open.ts";
import { ledgerSchema } from "../schema-map.ts";

const { counterparties, currencies, transactions } = ledgerSchema;

export type LocalCounterpartyBalance = {
  counterpartyId: Id<"counterparties">;
  name: string;
  kind: CounterpartyKind;
  settlementCurrency: CurrencyCode | null;
  currency: CurrencyCode;
  decimals: number;
  balance: Money;
  /** Companies only (O15) — `null` for a person, and for a company with nothing open. */
  ageDays: number | null;
  bucket: money.AgeBucket | null;
};

type DebtLegRow = {
  id: Id<"transactions">;
  date: AccountingDate;
  type: money.TxnType;
  amountOriginal: Money;
  toAmount: Money | null;
  side: "from" | "to";
  currency: CurrencyCode;
};

export function readCounterpartyBalances<TRun, TSchema extends typeof ledgerSchema>(
  db: ReplicaDb<TRun, TSchema>,
  today: AccountingDate,
): readonly LocalCounterpartyBalance[] {
  const rows = db
    .select({
      counterpartyId: transactions.counterpartyId,
      name: counterparties.name,
      kind: counterparties.kind,
      settlementCurrency: counterparties.settlementCurrency,
      transactionId: transactions.id,
      date: transactions.date,
      type: transactions.type,
      amountOriginal: transactions.amountOriginal,
      toAmount: transactions.toAmount,
      currency: transactions.currency,
      debtCurrency: transactions.debtCurrency,
    })
    .from(transactions)
    .innerJoin(counterparties, eq(transactions.counterpartyId, counterparties.id))
    .where(
      and(
        isNull(transactions.deletedAt),
        eq(transactions.counterpartyRole, "debt"),
        eq(counterparties.archived, false),
      ),
    )
    .all();

  const decimalsByCurrency = new Map(
    db
      .select({ code: currencies.code, decimals: currencies.decimals })
      .from(currencies)
      .all()
      .map((row) => [row.code, row.decimals] as const),
  );

  type Bucket = {
    name: string;
    kind: CounterpartyKind;
    settlementCurrency: CurrencyCode | null;
    rows: DebtLegRow[];
  };
  const byCounterparty = new Map<Id<"counterparties">, Bucket>();

  for (const row of rows) {
    // The inner join on `counterparties.id` guarantees this is set for every
    // row actually returned — narrowed here rather than left `| null`.
    if (row.counterpartyId === null) continue;
    const side: "from" | "to" = row.type === "transfer" ? "to" : "from";
    const currency = row.debtCurrency ?? row.currency;
    const bucket = byCounterparty.get(row.counterpartyId) ?? {
      name: row.name,
      kind: row.kind,
      settlementCurrency: row.settlementCurrency,
      rows: [],
    };
    bucket.rows.push({
      id: row.transactionId,
      date: row.date,
      type: row.type,
      amountOriginal: row.amountOriginal,
      toAmount: row.toAmount,
      side,
      currency,
    });
    byCounterparty.set(row.counterpartyId, bucket);
  }

  const result: LocalCounterpartyBalance[] = [];
  for (const [
    counterpartyId,
    { name, kind, settlementCurrency, rows: debtRows },
  ] of byCounterparty) {
    const balances = money.counterpartyBalance(debtRows);
    for (const { currency, balance } of balances) {
      let ageDays: number | null = null;
      let bucket: money.AgeBucket | null = null;
      if (kind === "company") {
        const deltas = debtRows
          .filter((row) => row.currency === currency)
          .map((row) => ({ id: row.id, date: row.date, delta: money.debtDelta(row, row.side) }));
        const oldest = money.fifoOldestOpen(deltas);
        if (oldest) {
          ageDays = money.ageInDays(oldest.date, today);
          bucket = money.ageBucket(ageDays);
        }
      }
      result.push({
        counterpartyId,
        name,
        kind,
        settlementCurrency,
        currency,
        decimals: decimalsByCurrency.get(currency) ?? 2,
        balance,
        ageDays,
        bucket,
      });
    }
  }

  return result.sort(
    (a, b) => a.name.localeCompare(b.name) || a.currency.localeCompare(b.currency),
  );
}
