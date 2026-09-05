/**
 * `clear_manual_rate`, on the device — §7.6's undo.
 *
 * **Deletes `manual` rows only.** A synced or carried-forward row for the
 * same pair and dates is untouched — clearing an override restores whatever
 * the provider last held, it does not invent a hole where a real reading
 * exists.
 */

import { type ClearManualRateInput, clearManualRateInput } from "@waltning/core/registry/inputs";
import { and, eq, gte, lte } from "drizzle-orm";
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

  const deleted = tx
    .delete(fxRates)
    .where(
      and(
        eq(fxRates.base, input.base),
        eq(fxRates.quote, input.quote),
        gte(fxRates.date, input.from),
        lte(fxRates.date, input.to),
        eq(fxRates.source, "manual"),
      ),
    )
    .returning()
    .all();

  return { deleted: deleted.length };
}
