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
 *
 * **`coalesce(debt_currency, currency)` is read the other way too: where
 * `debt_currency` is set, `debt_amount` values the row instead of
 * `amount_original`/`to_amount`.** SPEC.md §6.6: *"where null, the
 * transaction's own currency and amount apply"* — which only makes sense if
 * the debt figure applies where it is **not** null, since that is the one
 * already denominated in the currency the balance buckets by. A settlement
 * paying 50 EUR that discharges 214,05 PLN must subtract 214,05 from the PLN
 * balance, not 50 — folding the leg's own amount here was exactly that bug.
 *
 * **Archived counterparties are not dropped by the query.** SPEC.md: archiving
 * hides a counterparty from pickers, but *history keeps working* — and
 * `update_counterparty`'s own archive gate (S15 §6) refuses archiving while a
 * §7 balance is open, so an archived counterparty is normally settled. A
 * non-zero balance under one is still history that needs to be seen (e.g. one
 * archived before this coalesce fix landed), so this filters archived
 * counterparties down to their non-zero balances in application code, after
 * folding — never in the `WHERE`, which cannot see a fold's result — rather
 * than excluding them outright.
 */

import type { AccountingDate } from "@waltning/core/date";
import type { Id } from "@waltning/core/id";
import type { CurrencyCode, Money } from "@waltning/core/money";
import * as money from "@waltning/core/money";
import type { CounterpartyKind } from "@waltning/schema/enums";
import { and, eq, isNull } from "drizzle-orm";
import type { ReplicaDb } from "../open.ts";
import { ledgerSchema } from "../schema-map.ts";
import type { LocalTx } from "../write.ts";

const { counterparties, currencies, transactions } = ledgerSchema;
type ReplicaTx = LocalTx<unknown, typeof ledgerSchema>;

/**
 * `amountOriginal`/`toAmount`, coalesced with `debt_amount` when
 * `debt_currency` is set — the one substitution both
 * `readCounterpartyBalances` and `balancesForCounterparty` below make before
 * handing rows to `money.counterpartyBalance`/`money.debtDelta`.
 */
function coalesceDebtAmount<T extends { amountOriginal: Money; toAmount?: Money | null }>(
  row: T,
  debtCurrency: CurrencyCode | null,
  debtAmount: Money | null,
): T {
  if (debtCurrency === null) return row;
  const value = debtAmount ?? row.amountOriginal;
  return { ...row, amountOriginal: value, toAmount: value };
}

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
      archived: counterparties.archived,
      transactionId: transactions.id,
      date: transactions.date,
      type: transactions.type,
      amountOriginal: transactions.amountOriginal,
      toAmount: transactions.toAmount,
      currency: transactions.currency,
      debtCurrency: transactions.debtCurrency,
      debtAmount: transactions.debtAmount,
    })
    .from(transactions)
    .innerJoin(counterparties, eq(transactions.counterpartyId, counterparties.id))
    .where(and(isNull(transactions.deletedAt), eq(transactions.counterpartyRole, "debt")))
    // M3 — deterministic input order. `fifoOldestOpen` re-sorts by
    // `(date, id)` internally so this never changes ageing, but the fold
    // below builds `byCounterparty` (and each bucket's own `balances`) by
    // walking these rows in order, and nothing downstream should have to
    // depend on whatever order SQLite happened to return them in.
    .orderBy(transactions.counterpartyId, transactions.currency)
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
    archived: boolean;
    rows: DebtLegRow[];
  };
  const byCounterparty = new Map<Id<"counterparties">, Bucket>();

  for (const row of rows) {
    // The inner join on `counterparties.id` guarantees this is set for every
    // row actually returned — narrowed here rather than left `| null`.
    if (row.counterpartyId === null) continue;
    const side: "from" | "to" = row.type === "transfer" ? "to" : "from";
    const currency = row.debtCurrency ?? row.currency;
    const { amountOriginal, toAmount } = coalesceDebtAmount(row, row.debtCurrency, row.debtAmount);
    const bucket = byCounterparty.get(row.counterpartyId) ?? {
      name: row.name,
      kind: row.kind,
      settlementCurrency: row.settlementCurrency,
      archived: row.archived,
      rows: [],
    };
    bucket.rows.push({
      id: row.transactionId,
      date: row.date,
      type: row.type,
      amountOriginal,
      toAmount,
      side,
      currency,
    });
    byCounterparty.set(row.counterpartyId, bucket);
  }

  const result: LocalCounterpartyBalance[] = [];
  for (const [
    counterpartyId,
    { name, kind, settlementCurrency, archived, rows: debtRows },
  ] of byCounterparty) {
    const balances = money.counterpartyBalance(debtRows);
    for (const { currency, balance } of balances) {
      // Archived is hidden from pickers when settled (SPEC.md); a non-zero
      // balance is still history that must be seen.
      if (archived && money.isZero(balance)) continue;
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

/**
 * §7's fold for **one** counterparty, over a live transaction — the shape
 * `settle_debt` and `update_counterparty` each need: no ageing, no name, no
 * `today`, just `{ currency, balance }[]` to read a residual off of or gate
 * an archive against. Shares the same `coalesceDebtAmount` substitution
 * `readCounterpartyBalances` makes, so a settlement's discharged amount is
 * never read as the leg's own.
 */
export function balancesForCounterparty(
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
      const { amountOriginal, toAmount } = coalesceDebtAmount(
        row,
        row.debtCurrency,
        row.debtAmount,
      );
      return {
        type: row.type,
        amountOriginal,
        toAmount,
        side: row.type === "transfer" ? ("to" as const) : ("from" as const),
        currency: row.debtCurrency ?? row.currency,
      };
    }),
  );
}
