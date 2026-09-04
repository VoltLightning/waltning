/**
 * `set_pinned`, on the device — §7.0, which currencies appear in the header
 * display-currency toggle. Compare-and-swap on `version`, matching
 * `set_rate_source`.
 */

import { type SetPinnedInput, setPinnedInput } from "@waltning/core/registry/inputs";
import { and, eq, sql } from "drizzle-orm";
import { defineLocalExecutor, LocalRefusal } from "../executor.ts";
import { ledgerSchema as schema } from "../schema-map.ts";
import type { LocalTx } from "../write.ts";
import type { LocalCurrencyRow } from "./add-currency.executor.ts";

const { currencies } = schema;

type ReplicaTx = LocalTx<unknown, typeof schema>;

export const setPinnedExecutor = defineLocalExecutor<
  typeof setPinnedInput,
  LocalCurrencyRow,
  ReplicaTx
>({
  operation: "set_pinned",
  opVersion: 1,
  input: setPinnedInput,
  mints: () => [],
  apply: (input, tx) => setPinned(input, tx),
});

function setPinned(input: SetPinnedInput, tx: ReplicaTx): LocalCurrencyRow {
  const [current] = tx.select().from(currencies).where(eq(currencies.code, input.code)).all();
  if (!current) {
    throw new LocalRefusal(`set_pinned: no currency ${input.code}`);
  }
  if (current.archived) {
    throw new LocalRefusal(`set_pinned: ${input.code} is archived`);
  }
  if (current.version !== input.version) {
    throw new LocalRefusal(
      `set_pinned: stale version — read ${input.version}, row is at ${current.version}`,
    );
  }

  const [updated] = tx
    .update(currencies)
    .set({ pinned: input.pinned, version: sql`${currencies.version} + 1`, updatedAt: new Date() })
    .where(and(eq(currencies.code, input.code), eq(currencies.version, input.version)))
    .returning()
    .all();

  if (!updated) {
    throw new Error("set_pinned: the row changed between read and write");
  }
  return updated;
}
