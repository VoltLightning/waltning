/**
 * Exactly what `merge_categories` (`merge-categories.executor.ts`) is about
 * to move, split by table — S19 §7: *"states how many transactions will
 * move — before it happens."* A preview number that does not match the
 * write it previews is worse than none, so this mirrors the executor's own
 * three updates precisely rather than reusing `readCategoryUsage`'s
 * deduplicated display count, which answers a different question ("how many
 * transactions touch this category", §6) and is not what a merge moves row
 * for row.
 *
 * **No `deletedAt` filter, on purpose.** The executor's own `UPDATE
 * transactions SET category_id = … WHERE category_id = loserId` does not
 * exclude soft-deleted rows either — repointing them too is what keeps a
 * later `restore` (were one to exist) pointed at a category that still
 * exists. The preview states what actually moves, not a display subset of it.
 */

import type { Id } from "@waltning/core/id";
import { count, eq } from "drizzle-orm";
import type { ReplicaDb } from "../open.ts";
import { ledgerSchema } from "../schema-map.ts";

const { recurringTransactions, transactionLines, transactions } = ledgerSchema;

export type CategoryReferenceCounts = {
  transactions: number;
  lines: number;
  rules: number;
};

export function readCategoryReferenceCounts<TRun, TSchema extends typeof ledgerSchema>(
  db: ReplicaDb<TRun, TSchema>,
  categoryId: Id<"categories">,
): CategoryReferenceCounts {
  const [{ value: transactionCount } = { value: 0 }] = db
    .select({ value: count() })
    .from(transactions)
    .where(eq(transactions.categoryId, categoryId))
    .all();
  const [{ value: lineCount } = { value: 0 }] = db
    .select({ value: count() })
    .from(transactionLines)
    .where(eq(transactionLines.categoryId, categoryId))
    .all();
  const [{ value: ruleCount } = { value: 0 }] = db
    .select({ value: count() })
    .from(recurringTransactions)
    .where(eq(recurringTransactions.categoryId, categoryId))
    .all();

  return { transactions: transactionCount, lines: lineCount, rules: ruleCount };
}
