/**
 * `set_manual_rate`, on the device — §7.6 level 2, *"correct a bad or
 * missing provider figure… a range writes one `manual` row per day across
 * it"*.
 *
 * **Every rate input refuses `base !== pivot`.** `fx_rates` is stored one
 * way only, `(base = pivot, quote = X)` (§4) — there is no other shape a
 * hand-entered rate could take, and the pivot is data the input's own Zod
 * schema cannot see (only the replica knows which currency it is).
 *
 * **Checked before anything is written.** `overwriteManual` carries S18 §8's
 * second confirmation as data, and a partial write followed by a refusal
 * would leave some days replaced and others not — indistinguishable from a
 * bug. The whole range is validated first; the loop that follows cannot
 * fail.
 */

import { type AccountingDate, addDays } from "@waltning/core/date";
import { type SetManualRateInput, setManualRateInput } from "@waltning/core/registry/inputs";
import { and, eq, gte, lte } from "drizzle-orm";
import { defineLocalExecutor, LocalRefusal } from "../executor.ts";
import { ledgerSchema as schema } from "../schema-map.ts";
import type { LocalTx } from "../write.ts";

const { currencies, fxRates } = schema;

type ReplicaTx = LocalTx<unknown, typeof schema>;

export type SetManualRateResult = { written: number; replacedManual: number };

export const setManualRateExecutor = defineLocalExecutor<
  typeof setManualRateInput,
  SetManualRateResult,
  ReplicaTx
>({
  operation: "set_manual_rate",
  opVersion: 1,
  input: setManualRateInput,
  mints: () => [],
  apply: (input, tx) => setManualRate(input, tx),
});

/** Every date from `from` to `to`, inclusive. */
function dateRange(from: AccountingDate, to: AccountingDate): AccountingDate[] {
  const dates: AccountingDate[] = [];
  for (let d = from; d <= to; d = addDays(d, 1)) dates.push(d);
  return dates;
}

function setManualRate(input: SetManualRateInput, tx: ReplicaTx): SetManualRateResult {
  const [pivot] = tx.select().from(currencies).where(eq(currencies.isPivot, true)).all();
  if (!pivot) {
    throw new LocalRefusal("set_manual_rate: no pivot currency is set", { dependency: true });
  }
  if (input.base !== pivot.code) {
    throw new LocalRefusal(
      `set_manual_rate: base must be the pivot (${pivot.code}) — every rate is quoted against it`,
    );
  }

  const dates = dateRange(input.from, input.to);
  const existing = tx
    .select({ date: fxRates.date, source: fxRates.source })
    .from(fxRates)
    .where(
      and(
        eq(fxRates.base, input.base),
        eq(fxRates.quote, input.quote),
        gte(fxRates.date, input.from),
        lte(fxRates.date, input.to),
      ),
    )
    .all();
  const existingByDate = new Map(existing.map((row) => [row.date, row.source]));

  if (!input.overwriteManual) {
    const conflict = dates.find((date) => existingByDate.get(date) === "manual");
    if (conflict) {
      throw new LocalRefusal(
        `set_manual_rate: ${conflict} already has a manual rate — pass overwriteManual to replace it`,
      );
    }
  }

  let replacedManual = 0;
  for (const date of dates) {
    if (existingByDate.get(date) === "manual") replacedManual += 1;
    tx.insert(fxRates)
      .values({ base: input.base, quote: input.quote, date, rate: input.rate, source: "manual" })
      .onConflictDoUpdate({
        target: [fxRates.base, fxRates.quote, fxRates.date],
        set: { rate: input.rate, source: "manual" },
      })
      .run();
  }

  return { written: dates.length, replacedManual };
}
