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
 *
 * **A `decimals` decrease is refused while anything live still holds the
 * currency (H5).** Growing precision never loses information; shrinking it
 * does — `4.20` in a 2dp currency truncated to 0dp reads as `4`, a figure
 * nobody typed. `archive_currency`'s own live-reference count, reused
 * exactly: only a live (non-archived) account or a live (not soft-deleted)
 * transaction counts, the same `computations.md` §1 T filter.
 */

import { type UpdateCurrencyInput, updateCurrencyInput } from "@waltning/core/registry/inputs";
import { and, eq, isNull, or, sql } from "drizzle-orm";
import { defineLocalExecutor, LocalRefusal } from "../executor.ts";
import { ledgerSchema as schema } from "../schema-map.ts";
import type { LocalTx } from "../write.ts";
import type { LocalCurrencyRow } from "./add-currency.executor.ts";

const { accounts, currencies, transactions } = schema;
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
    throw new LocalRefusal(`update_currency: no currency ${input.code}`, { dependency: true });
  }
  if (current.version !== input.version) {
    throw new LocalRefusal(
      `update_currency: stale version — read ${input.version}, row is at ${current.version}`,
    );
  }

  if (input.patch.decimals !== undefined && input.patch.decimals < current.decimals) {
    const [{ n: liveAccounts } = { n: 0 }] = tx
      .select({ n: sql<number>`count(*)` })
      .from(accounts)
      .where(and(eq(accounts.currency, input.code), eq(accounts.archived, false)))
      .all();
    const [{ n: liveTransactions } = { n: 0 }] = tx
      .select({ n: sql<number>`count(*)` })
      .from(transactions)
      .where(
        and(
          or(
            eq(transactions.currency, input.code),
            eq(transactions.toCurrency, input.code),
            eq(transactions.debtCurrency, input.code),
          ),
          isNull(transactions.deletedAt),
        ),
      )
      .all();
    const live = liveAccounts + liveTransactions;
    if (live > 0) {
      throw new LocalRefusal(
        `update_currency: refused — decimals cannot shrink from ${current.decimals} to ` +
          `${input.patch.decimals} while ${input.code} still names ${live} live account(s)/transaction(s)`,
      );
    }
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
