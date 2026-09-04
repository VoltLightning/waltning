/**
 * How many live transactions **touch** each category — S19's usage count,
 * shown as a `Tag` beside every leaf and used to decide what is safe to
 * archive (J12 §7: *"no leaf with zero lifetime transactions survives a year
 * unarchived"*).
 *
 * **`computations.md` §6's trap, restated as a count.** §6 refuses a
 * `LEFT JOIN … COALESCE`: a four-line transaction would contribute its own
 * amount four times. The same shape breaks a count — a four-line transaction
 * with two lines in `Groceries` must count as **one** use of `Groceries`, not
 * two, because the question is "does this transaction touch the category",
 * not "how many rows name it". So this walks lines and transactions
 * separately, the same "lines win where they exist" split §6 uses for
 * amounts, and dedupes to (transaction, category) pairs before tallying.
 *
 * A recurring rule counts too, one each — a rule with no occurrence posted
 * yet is still a live reference (`convert-leaf-group.executor.ts`'s own
 * `referenceCount` checks the same three tables before refusing a
 * leaf→group conversion). It has no lines to dedupe against, so every
 * enabled-or-not row just adds one.
 *
 * **Soft-deleted transactions are excluded.** `delete_transaction` is soft
 * (`deleted_at`); a hidden row is not a use a person can see, and counting it
 * would print a number nobody could reconcile against the tree.
 */

import type { Id } from "@waltning/core/id";
import { eq, isNull } from "drizzle-orm";
import type { ReplicaDb } from "../open.ts";
import { ledgerSchema } from "../schema-map.ts";

const { recurringTransactions, transactionLines, transactions } = ledgerSchema;

export function readCategoryUsage<TRun, TSchema extends typeof ledgerSchema>(
  db: ReplicaDb<TRun, TSchema>,
): ReadonlyMap<Id<"categories">, number> {
  const usage = new Map<Id<"categories">, number>();
  const touch = (categoryId: Id<"categories"> | null) => {
    if (categoryId === null) return;
    usage.set(categoryId, (usage.get(categoryId) ?? 0) + 1);
  };

  // Every line on a live transaction, grouped back to its transaction so a
  // repeated category on several lines of the same transaction collapses to
  // one touch.
  const lineRows = db
    .select({
      transactionId: transactionLines.transactionId,
      categoryId: transactionLines.categoryId,
    })
    .from(transactionLines)
    .innerJoin(transactions, eq(transactionLines.transactionId, transactions.id))
    .where(isNull(transactions.deletedAt))
    .all();

  const categoriesByTransaction = new Map<string, Set<Id<"categories">>>();
  for (const row of lineRows) {
    if (row.categoryId === null) continue;
    const set = categoriesByTransaction.get(row.transactionId);
    if (set) set.add(row.categoryId);
    else categoriesByTransaction.set(row.transactionId, new Set([row.categoryId]));
  }
  for (const categories of categoriesByTransaction.values()) {
    for (const categoryId of categories) touch(categoryId);
  }

  // Lines win where they exist (§6) — a transaction already counted through
  // its lines does not also count through its own (possibly stale) category.
  const hasLines = categoriesByTransaction;
  const txnRows = db
    .select({ id: transactions.id, categoryId: transactions.categoryId })
    .from(transactions)
    .where(isNull(transactions.deletedAt))
    .all();
  for (const row of txnRows) {
    if (hasLines.has(row.id)) continue;
    touch(row.categoryId);
  }

  const recurringRows = db
    .select({ categoryId: recurringTransactions.categoryId })
    .from(recurringTransactions)
    .all();
  for (const row of recurringRows) touch(row.categoryId);

  return usage;
}
