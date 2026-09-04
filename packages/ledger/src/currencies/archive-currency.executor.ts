/**
 * `archive_currency`, on the device — S17 §6 *Gated*.
 *
 * **Refused for the pivot, and for any currency a live account or
 * transaction still references.** SQLite has no cross-table trigger in the
 * replica's DDL (`ddl.ts`'s own header), so unlike `fx_rates_pk` this
 * guarantee cannot be mirrored as a constraint here — it is this refusal
 * alone, and the server's own trigger, layered around the same shared
 * columns the way §14.7 asks. A constraint that is declared and does not
 * ship is worse than one that was never declared, so this stays a plain
 * `throw` rather than a comment claiming a guarantee this file cannot make.
 *
 * **Only live accounts count.** An archived account's currency is not a
 * reference that blocks archiving — an archived account is already excluded
 * from every balance and figure that would need the currency to keep
 * meaning, the same reason a soft-deleted transaction is excluded below;
 * counting it would refuse to archive a currency nothing live actually uses.
 */

import { type ArchiveCurrencyInput, archiveCurrencyInput } from "@waltning/core/registry/inputs";
import { and, eq, isNull, or, sql } from "drizzle-orm";
import { defineLocalExecutor, LocalRefusal } from "../executor.ts";
import { ledgerSchema as schema } from "../schema-map.ts";
import type { LocalTx } from "../write.ts";
import type { LocalCurrencyRow } from "./add-currency.executor.ts";

const { accounts, currencies, transactions } = schema;

type ReplicaTx = LocalTx<unknown, typeof schema>;

export const archiveCurrencyExecutor = defineLocalExecutor<
  typeof archiveCurrencyInput,
  LocalCurrencyRow,
  ReplicaTx
>({
  operation: "archive_currency",
  opVersion: 1,
  input: archiveCurrencyInput,
  mints: () => [],
  apply: (input, tx) => archiveCurrency(input, tx),
});

function archiveCurrency(input: ArchiveCurrencyInput, tx: ReplicaTx): LocalCurrencyRow {
  const [current] = tx.select().from(currencies).where(eq(currencies.code, input.code)).all();
  if (!current) {
    throw new LocalRefusal(`archive_currency: no currency ${input.code}`);
  }
  if (current.archived) {
    throw new LocalRefusal(`archive_currency: ${input.code} is already archived`);
  }
  if (current.version !== input.version) {
    throw new LocalRefusal(
      `archive_currency: stale version — read ${input.version}, row is at ${current.version}`,
    );
  }
  if (current.isPivot) {
    throw new LocalRefusal(
      `archive_currency: ${input.code} is the pivot — change_pivot before archiving it`,
    );
  }

  const [{ n: liveAccounts } = { n: 0 }] = tx
    .select({ n: sql<number>`count(*)` })
    .from(accounts)
    .where(and(eq(accounts.currency, input.code), eq(accounts.archived, false)))
    .all();
  if (liveAccounts > 0) {
    throw new LocalRefusal(
      `archive_currency: ${input.code} still names ${liveAccounts} live account(s)`,
    );
  }

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
  if (liveTransactions > 0) {
    throw new LocalRefusal(
      `archive_currency: ${input.code} still names ${liveTransactions} live transaction(s)`,
    );
  }

  const [updated] = tx
    .update(currencies)
    .set({ archived: true, version: sql`${currencies.version} + 1`, updatedAt: new Date() })
    .where(and(eq(currencies.code, input.code), eq(currencies.version, input.version)))
    .returning()
    .all();

  if (!updated) {
    throw new Error("archive_currency: the row changed between read and write");
  }
  return updated;
}
