/**
 * `update_currency`, on the device — S17 §9.2, cosmetic patch only.
 *
 * **Compare-and-swap on `version`, then patch** — `update-account.executor.ts`'s
 * own shape exactly: the write carries the version it read, and a mismatch
 * means the row moved under the writer.
 *
 * **No archived guard, unlike `set_rate_source`.** Symbol, position and
 * decimals describe how a figure *renders* — an archived currency's own
 * history still renders through them (a transaction booked in a currency
 * archived since keeps showing its symbol), so refusing the write there
 * would leave a stale symbol with no way back short of un-archiving.
 */

import { type UpdateCurrencyInput, updateCurrencyInput } from "@waltning/core/registry/inputs";
import { and, eq, sql } from "drizzle-orm";
import { defineLocalExecutor } from "../executor.ts";
import { ledgerSchema as schema } from "../schema-map.ts";
import type { LocalTx } from "../write.ts";
import type { LocalCurrencyRow } from "./add-currency.executor.ts";

const { currencies } = schema;
type ReplicaTx = LocalTx<unknown, typeof schema>;

export const updateCurrencyExecutor = defineLocalExecutor<
  typeof updateCurrencyInput,
  LocalCurrencyRow,
  ReplicaTx
>({
  operation: "update_currency",
  opVersion: 1,
  input: updateCurrencyInput,
  mints: () => [],
  apply: (input, tx) => patchCurrency(input, tx),
});

function patchCurrency(input: UpdateCurrencyInput, tx: ReplicaTx): LocalCurrencyRow {
  const [current] = tx.select().from(currencies).where(eq(currencies.code, input.code)).all();
  if (!current) {
    throw new Error(`update_currency: no currency ${input.code}`);
  }
  if (current.version !== input.version) {
    throw new Error(
      `update_currency: stale version — read ${input.version}, row is at ${current.version}`,
    );
  }

  const [updated] = tx
    .update(currencies)
    .set({ ...input.patch, version: sql`${currencies.version} + 1`, updatedAt: new Date() })
    .where(and(eq(currencies.code, input.code), eq(currencies.version, input.version)))
    .returning()
    .all();

  if (!updated) {
    throw new Error("update_currency: the row changed between read and write");
  }
  return updated;
}
