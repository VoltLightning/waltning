/**
 * `change_pivot`, on the device — §7.0 *"genuinely rare, and the one heavy
 * operation left"*.
 *
 * **Refused while any live transaction exists** — `deleted_at is null`,
 * `computations.md` §1's T, the same filter every other read in this file
 * uses. Every stamped `fx_rate` in the ledger is pivot-per-unit against the
 * *current* pivot; re-basing them onto a new one is a full re-rating of
 * history, and a phone alone has no series to re-rate against — there is no
 * re-rating on a phone alone. So this is the first-run step (S29a), before
 * the first capture, or nothing.
 *
 * **The rewrite, in one pass per date.** `fx_rates` holds `(base = P, quote
 * = X, rate = r)` meaning `1 P = r X` (§4, units-per-pivot). For a date
 * where a bridging rate to the new pivot `Q` is held — `(base = P, quote =
 * Q, rate = k)`, meaning `1 P = k Q` — every other row on that date
 * re-bases by division: `1 Q = (1/k) P = (r/k) X`, so the new row is `(base
 * = Q, quote = X, rate = r/k)`. The old pivot itself becomes an ordinary
 * quote: `(base = Q, quote = P, rate = 1/k)`. A date with **no** bridging
 * rate cannot be re-derived at all and is dropped rather than left mis-
 * quoted against a pivot that no longer holds — arc 2's sync repopulates it
 * against the new pivot once it exists.
 */

import { dec, type UnitsPerPivot, unitsPerPivot } from "@waltning/core/money";
import { type ChangePivotInput, changePivotInput } from "@waltning/core/registry/inputs";
import { eq, isNull, sql } from "drizzle-orm";
import { defineLocalExecutor } from "../executor.ts";
import { ledgerSchema as schema } from "../schema-map.ts";
import type { LocalTx } from "../write.ts";
import type { LocalCurrencyRow } from "./add-currency.executor.ts";

const { currencies, fxRates, transactions } = schema;

type ReplicaTx = LocalTx<unknown, typeof schema>;
type LocalFxRateRow = typeof fxRates.$inferSelect;

/** See `read-rate.ts`'s own copy — the server's carried-forward marker. */
const CARRIED_FORWARD = "carried_forward";

export const changePivotExecutor = defineLocalExecutor<
  typeof changePivotInput,
  LocalCurrencyRow,
  ReplicaTx
>({
  operation: "change_pivot",
  opVersion: 1,
  input: changePivotInput,
  mints: () => [],
  apply: (input, tx) => changePivot(input, tx),
});

function changePivot(input: ChangePivotInput, tx: ReplicaTx): LocalCurrencyRow {
  const [newPivot] = tx.select().from(currencies).where(eq(currencies.code, input.code)).all();
  if (!newPivot) {
    throw new Error(`change_pivot: no currency ${input.code}`);
  }
  if (newPivot.archived) {
    throw new Error(`change_pivot: ${input.code} is archived`);
  }
  if (newPivot.isPivot) {
    throw new Error(`change_pivot: ${input.code} is already the pivot`);
  }

  const [oldPivot] = tx.select().from(currencies).where(eq(currencies.isPivot, true)).all();
  if (!oldPivot) {
    throw new Error("change_pivot: no pivot currency is set");
  }

  const [{ n: txnCount } = { n: 0 }] = tx
    .select({ n: sql<number>`count(*)` })
    .from(transactions)
    .where(isNull(transactions.deletedAt))
    .all();
  if (txnCount > 0) {
    throw new Error(
      "change_pivot: refused — a phone alone cannot re-rate existing transactions; " +
        "change the pivot before the first capture (S29a)",
    );
  }

  const rows = tx.select().from(fxRates).where(eq(fxRates.base, oldPivot.code)).all();
  const byDate = new Map<string, LocalFxRateRow[]>();
  for (const row of rows) {
    const bucket = byDate.get(row.date) ?? [];
    bucket.push(row);
    byDate.set(row.date, bucket);
  }

  // A carried-forward row's own date rarely matches its origin's — it holds
  // a copy of the nearest earlier real quote. Traced here, per quote, oldest
  // first, the same walk-back `findOrigin` (`read-rate.ts`) does at read
  // time — needed below to tell an orphaned carried row from one whose
  // origin survives the rewrite (C2).
  const realByQuote = new Map<string, LocalFxRateRow[]>();
  for (const row of rows) {
    if (row.source === CARRIED_FORWARD) continue;
    const bucket = realByQuote.get(row.quote) ?? [];
    bucket.push(row);
    realByQuote.set(row.quote, bucket);
  }
  for (const bucket of realByQuote.values()) bucket.sort((a, b) => (a.date < b.date ? -1 : 1));

  function originDateOf(quote: string, date: string): string | undefined {
    let found: string | undefined;
    for (const row of realByQuote.get(quote) ?? []) {
      if (row.date > date) break;
      found = row.date;
    }
    return found;
  }

  // Dates a bridge rate to the new pivot survives on — computed before the
  // delete below so a carried row's origin can be checked against it.
  const bridgeDates = new Set<string>();
  for (const [date, dateRows] of byDate) {
    if (dateRows.some((row) => row.quote === newPivot.code)) bridgeDates.add(date);
  }

  tx.delete(fxRates).where(eq(fxRates.base, oldPivot.code)).run();

  for (const dateRows of byDate.values()) {
    const bridge = dateRows.find((row) => row.quote === newPivot.code);
    if (!bridge) continue; // no bridge for this date — dropped, not mis-quoted; §4's own header.
    const k = dec(bridge.rate);

    for (const row of dateRows) {
      if (row.quote === newPivot.code) continue; // consumed into the reciprocal row below
      if (row.source === CARRIED_FORWARD) {
        const origin = originDateOf(row.quote, row.date);
        // An orphaned carried-forward child (C2) — its origin's own date had
        // no bridge and was dropped above, so this row's rate would now
        // trace to nothing. §7.6: the table never holds an invented figure.
        if (origin === undefined || !bridgeDates.has(origin)) continue;
      }
      const rebased: UnitsPerPivot = unitsPerPivot(dec(row.rate).dividedBy(k));
      tx.insert(fxRates)
        .values({
          base: newPivot.code,
          quote: row.quote,
          date: row.date,
          rate: rebased,
          source: row.source,
        })
        .run();
    }

    const reciprocal: UnitsPerPivot = unitsPerPivot(dec(1).dividedBy(k));
    tx.insert(fxRates)
      .values({
        base: newPivot.code,
        quote: oldPivot.code,
        date: bridge.date,
        rate: reciprocal,
        source: bridge.source,
      })
      .run();
  }

  tx.update(currencies)
    .set({ isPivot: false, version: sql`${currencies.version} + 1`, updatedAt: new Date() })
    .where(eq(currencies.code, oldPivot.code))
    .run();
  tx.update(currencies)
    .set({ isPivot: true, version: sql`${currencies.version} + 1`, updatedAt: new Date() })
    .where(eq(currencies.code, newPivot.code))
    .run();

  const [updated] = tx.select().from(currencies).where(eq(currencies.code, newPivot.code)).all();
  if (!updated) {
    throw new Error("change_pivot: the new pivot's row vanished mid-write");
  }
  return updated;
}
