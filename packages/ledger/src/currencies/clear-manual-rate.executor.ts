/**
 * `clear_manual_rate`, on the device — §7.6's undo.
 *
 * **Restores the displaced row when `set_manual_rate` preserved one (C1),
 * deletes only when it did not.** A `manual` row that overwrote a real
 * provider quote carries that quote in `displaced_rate` / `displaced_source`
 * / `displaced_fetched_at`; clearing puts it back, source and all, rather
 * than deleting the row and leaving a hole where a real reading exists. A
 * `manual` row with no displaced trio (the date held nothing before it) is
 * still deleted outright — there is nothing to restore it to.
 *
 * A synced or carried-forward row for the same pair and dates that this
 * write did **not** target is untouched either way.
 */

import { type ClearManualRateInput, clearManualRateInput } from "@waltning/core/registry/inputs";
import { and, eq, gte, isNotNull, lte, sql } from "drizzle-orm";
import { defineLocalExecutor, LocalRefusal } from "../executor.ts";
import { ledgerSchema as schema } from "../schema-map.ts";
import type { LocalTx } from "../write.ts";

const { currencies, fxRates } = schema;

type ReplicaTx = LocalTx<unknown, typeof schema>;

export type ClearManualRateResult = { deleted: number };

export const clearManualRateExecutor = defineLocalExecutor<
  typeof clearManualRateInput,
  ClearManualRateResult,
  ReplicaTx
>({
  operation: "clear_manual_rate",
  opVersion: 1,
  input: clearManualRateInput,
  mints: () => [],
  apply: (input, tx) => clearManualRate(input, tx),
});

function clearManualRate(input: ClearManualRateInput, tx: ReplicaTx): ClearManualRateResult {
  const [pivot] = tx.select().from(currencies).where(eq(currencies.isPivot, true)).all();
  if (!pivot) {
    throw new LocalRefusal("clear_manual_rate: no pivot currency is set", { dependency: true });
  }
  if (input.base !== pivot.code) {
    throw new LocalRefusal(
      `clear_manual_rate: base must be the pivot (${pivot.code}) — every rate is quoted against it`,
    );
  }

  const inRange = and(
    eq(fxRates.base, input.base),
    eq(fxRates.quote, input.quote),
    gte(fxRates.date, input.from),
    lte(fxRates.date, input.to),
    eq(fxRates.source, "manual"),
  );

  // C1 — restore, not delete, wherever a displaced row survives. Runs first:
  // a restored row's `source` is no longer `manual`, so the delete below —
  // which still filters on `source = 'manual'` via `inRange` — naturally
  // skips every row this just restored and only removes what is left.
  const restored = tx
    .update(fxRates)
    .set({
      rate: sql`${fxRates.displacedRate}`,
      source: sql`${fxRates.displacedSource}`,
      fetchedAt: sql`${fxRates.displacedFetchedAt}`,
      displacedRate: null,
      displacedSource: null,
      displacedFetchedAt: null,
    })
    .where(and(inRange, isNotNull(fxRates.displacedRate)))
    .returning()
    .all();

  const deleted = tx.delete(fxRates).where(inRange).returning().all();

  return { deleted: deleted.length + restored.length };
}
