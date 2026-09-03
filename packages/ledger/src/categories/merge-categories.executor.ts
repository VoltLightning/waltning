/**
 * `merge_categories`, on the device — J12: *"not reversible in one step."*
 *
 * Every `transactions`, `transaction_lines` and `recurring_transactions` row
 * naming `loserId` is repointed to `winnerId`, then the loser is archived
 * (never deleted — §6.9). No version field on the input: unlike
 * `rename_category` or `reparent_category`, this write is not a
 * compare-and-swap on one row's state, it is a bulk repoint whose safety
 * comes from the `refine` on the input (a category cannot merge into itself)
 * and the checks below, not from a version a caller could have raced
 * against.
 *
 * **`category_mappings`** — S19 §7 says the merge is recorded there so a bad
 * translation is corrected by re-running rather than by editing thousands of
 * rows. That table exists server-side (`packages/db/src/schema.ts`), but not
 * in `packages/schema` — the phone's SQLite replica has no `category_mappings`
 * table to write, because `schema-map.ts` only pulls in what `packages/schema`
 * declares. This executor moves the rows and archives the loser; the mapping
 * record is the server operation's to write, once one exists.
 */

import { type MergeCategoriesInput, mergeCategoriesInput } from "@waltning/core/registry/inputs";
import { eq, sql } from "drizzle-orm";
import { defineLocalExecutor } from "../executor.ts";
import { ledgerSchema as schema } from "../schema-map.ts";
import type { LocalTx } from "../write.ts";
import type { LocalCategoryRow } from "./create-category.executor.ts";

const { categories, recurringTransactions, transactionLines, transactions } = schema;
type ReplicaTx = LocalTx<unknown, typeof schema>;

export type MergeCategoriesResult = {
  loser: LocalCategoryRow;
  movedTransactions: number;
  movedLines: number;
  movedRecurring: number;
};

export const mergeCategoriesExecutor = defineLocalExecutor<
  typeof mergeCategoriesInput,
  MergeCategoriesResult,
  ReplicaTx
>({
  operation: "merge_categories",
  opVersion: 1,
  input: mergeCategoriesInput,
  mints: () => [],
  apply: (input, tx) => mergeCategories(input, tx),
});

function mergeCategories(input: MergeCategoriesInput, tx: ReplicaTx): MergeCategoriesResult {
  const [loser] = tx.select().from(categories).where(eq(categories.id, input.loserId)).all();
  const [winner] = tx.select().from(categories).where(eq(categories.id, input.winnerId)).all();
  if (!loser) throw new Error(`merge_categories: no category ${input.loserId}`);
  if (!winner) throw new Error(`merge_categories: no category ${input.winnerId}`);
  if (loser.archived) throw new Error(`merge_categories: ${input.loserId} is already archived`);
  if (winner.archived) throw new Error(`merge_categories: ${input.winnerId} is archived`);
  if (!loser.isLeaf || !winner.isLeaf) {
    // J12 §4 — "Survivor is a group: refused, only leaves hold transactions."
    // A group loser is refused for the identical reason: there is nothing on
    // it to move.
    throw new Error("merge_categories: only leaves hold transactions — refused on a group");
  }
  if (loser.kind !== winner.kind) {
    throw new Error(
      `merge_categories: ${input.loserId} is ${loser.kind}, ${input.winnerId} is ${winner.kind} — refused across kinds`,
    );
  }

  const movedTransactions = tx
    .update(transactions)
    .set({ categoryId: input.winnerId })
    .where(eq(transactions.categoryId, input.loserId))
    .returning({ id: transactions.id })
    .all().length;

  const movedLines = tx
    .update(transactionLines)
    .set({ categoryId: input.winnerId })
    .where(eq(transactionLines.categoryId, input.loserId))
    .returning({ id: transactionLines.id })
    .all().length;

  // A real FK (`recurring-transactions.sqlite.ts`) — a rule with no
  // occurrence posted yet still names the loser, and a merge that skipped it
  // would leave the rule posting into an archived category forever after.
  const movedRecurring = tx
    .update(recurringTransactions)
    .set({ categoryId: input.winnerId })
    .where(eq(recurringTransactions.categoryId, input.loserId))
    .returning({ id: recurringTransactions.id })
    .all().length;

  const [archivedLoser] = tx
    .update(categories)
    .set({ archived: true, version: sql`${categories.version} + 1`, updatedAt: new Date() })
    .where(eq(categories.id, input.loserId))
    .returning()
    .all();
  if (!archivedLoser) {
    throw new Error("merge_categories: the loser row changed between read and write");
  }

  return { loser: archivedLoser, movedTransactions, movedLines, movedRecurring };
}
