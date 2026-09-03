/**
 * `categorize_batch`, on the device — the bulk path.
 *
 * `operations.md`: *"one category over N ids; a `DiffCard` states the
 * affected count."* One `UPDATE … WHERE id IN (…)` rather than N single
 * updates, inside the one transaction `writeLocally` already holds open —
 * either every named row gets the category or none do.
 *
 * **Every named id must exist, be live, and be income or expense.**
 * `transactions_category_shape` refuses a category on a transfer or an
 * adjustment (§6.5) — batch-categorising one would queue a write guaranteed
 * to fail at drain, days later, with no field on screen to attach the
 * refusal to. All three conditions are stated in the one `WHERE`, so the
 * affected-row count *is* the check: fewer rows than ids named means one of
 * them was missing, deleted, or not income/expense, and the whole batch is
 * refused rather than applied partially.
 */

import { type CategorizeBatchInput, categorizeBatchInput } from "@waltning/core/registry/inputs";
import { and, eq, inArray, isNull, or, sql } from "drizzle-orm";
import { defineLocalExecutor } from "../executor.ts";
import { ledgerSchema as schema } from "../schema-map.ts";
import type { LocalTx } from "../write.ts";
import type { LocalTransactionRow } from "./create-transaction.executor.ts";

const { transactions } = schema;

type ReplicaTx = LocalTx<unknown, typeof schema>;

export const categorizeBatchExecutor = defineLocalExecutor<
  typeof categorizeBatchInput,
  LocalTransactionRow[],
  ReplicaTx
>({
  operation: "categorize_batch",
  opVersion: 1,

  input: categorizeBatchInput,

  /** Names rows, mints none — every id already exists. */
  mints: () => [],

  apply: (input, tx) => categorize(input, tx),
});

function categorize(input: CategorizeBatchInput, tx: ReplicaTx): LocalTransactionRow[] {
  const updated = tx
    .update(transactions)
    .set({
      categoryId: input.categoryId,
      version: sql`${transactions.version} + 1`,
      updatedAt: new Date(),
    })
    .where(
      and(
        inArray(transactions.id, input.transactionIds),
        isNull(transactions.deletedAt),
        or(eq(transactions.type, "income"), eq(transactions.type, "expense")),
      ),
    )
    .returning()
    .all();

  if (updated.length !== input.transactionIds.length) {
    throw new Error(
      `categorize_batch: named ${input.transactionIds.length} transactions, ${updated.length} ` +
        "were live income or expense rows — one is missing, deleted, or a transfer/adjustment " +
        "(transactions_category_shape)",
    );
  }

  return updated;
}
