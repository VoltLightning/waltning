/**
 * `set_rate_source`, on the device — §7.7, per-currency provider selection.
 *
 * Compare-and-swap on `version`, matching every other structural currency
 * write. `null` is a legal value — "no source chosen" — not the absence of
 * one; the executor writes exactly what it was given.
 */

import { type SetRateSourceInput, setRateSourceInput } from "@waltning/core/registry/inputs";
import { and, eq, sql } from "drizzle-orm";
import { defineLocalExecutor } from "../executor.ts";
import { ledgerSchema as schema } from "../schema-map.ts";
import type { LocalTx } from "../write.ts";
import type { LocalCurrencyRow } from "./add-currency.executor.ts";

const { currencies } = schema;

type ReplicaTx = LocalTx<unknown, typeof schema>;

export const setRateSourceExecutor = defineLocalExecutor<
  typeof setRateSourceInput,
  LocalCurrencyRow,
  ReplicaTx
>({
  operation: "set_rate_source",
  opVersion: 1,
  input: setRateSourceInput,
  mints: () => [],
  apply: (input, tx) => setRateSource(input, tx),
});

function setRateSource(input: SetRateSourceInput, tx: ReplicaTx): LocalCurrencyRow {
  const [current] = tx.select().from(currencies).where(eq(currencies.code, input.code)).all();
  if (!current) {
    throw new Error(`set_rate_source: no currency ${input.code}`);
  }
  if (current.archived) {
    throw new Error(`set_rate_source: ${input.code} is archived`);
  }
  if (current.version !== input.version) {
    throw new Error(
      `set_rate_source: stale version — read ${input.version}, row is at ${current.version}`,
    );
  }

  const [updated] = tx
    .update(currencies)
    .set({
      rateSource: input.rateSource,
      version: sql`${currencies.version} + 1`,
      updatedAt: new Date(),
    })
    .where(and(eq(currencies.code, input.code), eq(currencies.version, input.version)))
    .returning()
    .all();

  if (!updated) {
    throw new Error("set_rate_source: the row changed between read and write");
  }
  return updated;
}
