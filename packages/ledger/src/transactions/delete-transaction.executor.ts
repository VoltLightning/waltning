/**
 * `delete_transaction`, on the device — soft, always.
 *
 * `operations.md`: *"deletion is the one thing you cannot un-notice."* This
 * sets `deleted_at` and never removes the row: a balance read excludes a
 * deleted transaction (`computations.md`), but the row survives for the
 * server to admit the same soft delete rather than a row that has simply
 * vanished from a replica it cannot diff against.
 *
 * Version-checked like `update_transaction`, for the same reason: the phone
 * keeps the compare-and-swap discipline even with no second device to race,
 * so the outbox entry carries a version the drain can trust.
 */

import {
  type DeleteTransactionInput,
  deleteTransactionInput,
} from "@waltning/core/registry/inputs";
import { and, eq, isNull } from "drizzle-orm";
import { defineLocalExecutor, LocalRefusal } from "../executor.ts";
import { ledgerSchema as schema } from "../schema-map.ts";
import type { LocalTx } from "../write.ts";
import type { LocalTransactionRow } from "./create-transaction.executor.ts";

const { transactions } = schema;

type ReplicaTx = LocalTx<unknown, typeof schema>;

export const deleteTransactionExecutor = defineLocalExecutor<
  typeof deleteTransactionInput,
  LocalTransactionRow,
  ReplicaTx
>({
  operation: "delete_transaction",
  opVersion: 1,
  input: deleteTransactionInput,

  /** Names a row, mints none — a delete brings nothing into existence. */
  mints: () => [],

  apply: (input, tx) => softDeleteTransaction(input, tx),
});

function softDeleteTransaction(input: DeleteTransactionInput, tx: ReplicaTx): LocalTransactionRow {
  const current = tx.select().from(transactions).where(eq(transactions.id, input.id)).get();
  if (!current) {
    throw new LocalRefusal(`delete_transaction: no transaction ${input.id}`);
  }
  if (current.deletedAt !== null) {
    throw new LocalRefusal(`delete_transaction: ${input.id} is already deleted`);
  }
  if (current.version !== input.version) {
    throw new LocalRefusal(
      `delete_transaction: stale version — read ${input.version}, row is at ${current.version}`,
    );
  }

  const updated = tx
    .update(transactions)
    .set({
      deletedAt: new Date(),
      version: current.version + 1,
      updatedAt: new Date(),
    })
    .where(
      and(
        eq(transactions.id, input.id),
        eq(transactions.version, input.version),
        isNull(transactions.deletedAt),
      ),
    )
    .returning()
    .get();

  if (!updated) {
    throw new LocalRefusal("delete_transaction: the row changed between read and write");
  }
  return updated;
}
