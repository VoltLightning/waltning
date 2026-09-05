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
 *
 * **M2 — the category itself is checked before the bulk write, not by it.**
 * H1a says an archived category is never newly assigned, and this operation
 * assigns one category to N rows at once. The replica's own
 * `transactions_category_not_archived_update` trigger would abort the
 * statement, but a trigger names no operation and no field, and the abort
 * would arrive from inside an `UPDATE … WHERE id IN (…)` with nothing on
 * screen to attach it to. `assertCategoryNotArchived`
 * (`create-transaction.executor.ts` — the same function `create_transaction`
 * and `update_transaction` go through) runs first, so the refusal names
 * `categorize_batch` and `category_id`, and no row is touched.
 */

import { type CategorizeBatchInput, categorizeBatchInput } from "@waltning/core/registry/inputs";
import { and, eq, inArray, isNull, or, sql } from "drizzle-orm";
import { defineLocalExecutor, LocalRefusal } from "../executor.ts";
import { ledgerSchema as schema } from "../schema-map.ts";
import type { LocalTx } from "../write.ts";
import {
  assertCategoryNotArchived,
  type LocalTransactionRow,
} from "./create-transaction.executor.ts";

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
  // M2 — before the `UPDATE`, so no row is touched by a batch that cannot stand.
  assertCategoryNotArchived(tx, input.categoryId, "categorize_batch: category_id");

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

  /**
   * **Compared against the distinct id count, not the array length.**
   * `IN (…)` matches a row at most once no matter how many times its id is
   * repeated in the list, so the affected-row count is naturally deduped —
   * comparing it against a non-deduped length would refuse a harmless batch
   * that names the same id twice. `categorizeBatchInput` already dedupes on
   * the way in, so this `Set` is normally a no-op; computed again here rather
   * than trusted, because the invariant this check protects — one row per
   * distinct id — is the executor's to keep regardless of what upstream did.
   */
  const distinctIds = new Set(input.transactionIds).size;
  if (updated.length !== distinctIds) {
    throw new LocalRefusal(
      `categorize_batch: named ${distinctIds} distinct transactions, ${updated.length} ` +
        "were live income or expense rows — one is missing, deleted, or a transfer/adjustment " +
        "(transactions_category_shape)",
    );
  }

  return updated;
}
