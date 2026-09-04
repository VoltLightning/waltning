/**
 * `add_currency`, on the device — §7.0 *"Add a currency"*.
 *
 * **Mints the code, not a uuid.** A currency's identity is its ISO code —
 * `currencies.code` is the primary key, and no other table holds an
 * `Id<"currencies">` to point at. `mints` returns the code so `deriveDeps`
 * can hold a queued `create_account` (or any other write naming this
 * currency) behind this entry, the same way `create_group`'s uuid works for
 * an account naming a group added moments earlier, offline.
 */

import { type AddCurrencyInput, addCurrencyInput } from "@waltning/core/registry/inputs";
import { eq } from "drizzle-orm";
import { defineLocalExecutor } from "../executor.ts";
import { ledgerSchema as schema } from "../schema-map.ts";
import type { LocalTx } from "../write.ts";

const { currencies } = schema;

/** The row as the replica holds it. See `LocalAccountRow` for why not a projection. */
export type LocalCurrencyRow = typeof currencies.$inferSelect;

type ReplicaTx = LocalTx<unknown, typeof schema>;

export const addCurrencyExecutor = defineLocalExecutor<
  typeof addCurrencyInput,
  LocalCurrencyRow,
  ReplicaTx
>({
  operation: "add_currency",
  opVersion: 1,
  input: addCurrencyInput,
  mints: (input) => [input.code],
  apply: (input, tx) => insertCurrency(input, tx),
});

function insertCurrency(input: AddCurrencyInput, tx: ReplicaTx): LocalCurrencyRow {
  const [existing] = tx.select().from(currencies).where(eq(currencies.code, input.code)).all();

  if (existing) {
    throw new Error(
      existing.archived
        ? `add_currency: ${input.code} already exists, archived — un-archive it instead of adding it again`
        : `add_currency: ${input.code} already exists`,
    );
  }

  const [row] = tx
    .insert(currencies)
    .values({
      code: input.code,
      name: input.name,
      symbol: input.symbol,
      symbolPosition: input.symbolPosition,
      decimals: input.decimals,
      rateSource: input.rateSource,
      pinned: input.pinned,
      isPivot: false,
      archived: false,
    })
    .returning()
    .all();

  if (!row) {
    throw new Error("add_currency: the replica insert returned no row");
  }
  return row;
}
