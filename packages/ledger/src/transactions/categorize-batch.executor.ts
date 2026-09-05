/**
 * `categorize_batch`, on the device — the bulk path.
 *
 * `operations.md`: *"one category over N ids; a `DiffCard` states the
 * affected count."* One `UPDATE … WHERE id IN (…)` rather than N single
 * updates, inside the one transaction `writeLocally` already holds open —
 * either every named row gets the category or none do.
 *
 * **Every named id must exist, be live, be income or expense, and match the
 * category's kind.** `transactions_category_shape` refuses a category on a
 * transfer or an adjustment (§6.5); `transactions_category_kind_matches_
 * type`'s own batch form refuses an income category on an expense row or the
 * reverse (H1-b) — `create-phone-ledger.ts`'s `createTransaction` wrapper
 * already makes this same comparison for the single-row path, and
 * `apps/mobile/src/ledger-screen.tsx`'s desk selection bar refuses a mixed
 * batch before this executor is ever asked, but neither is a guarantee: the
 * executor's own check is what holds "even if that refusal is ever
 * bypassed," the same phrase the single-row comment already uses for its own
 * client check. All four conditions are stated in the one `WHERE`, so the
 * affected-row count *is* the check: fewer rows than ids named means one of
 * them was missing, deleted, not income/expense, or the wrong kind for this
 * category, and the whole batch is refused rather than applied partially.
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
 *
 * **The SQLite replica's own trigger pair** (`transactions_category_kind_
 * matches_type_insert`/`_update`) is the backstop under this: if this `WHERE`
 * ever had a bug that let a mismatched row through, the `UPDATE` itself would
 * abort at the database rather than writing a row Postgres would refuse to
 * accept back. Like every hand-written replica trigger it is created by
 * `migrate.ts`'s `REPLICA_BACKFILLS` `objects` hook on the last step that
 * rebuilds `transactions`, not by a migration step's own statements — see
 * that constant's own doc.
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

const { transactions, categories } = schema;

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

  // `undefined` only when `input.categoryId` names no row at all — the FK on
  // `transactions.category_id` refuses that on its own, with its own message,
  // so the `WHERE` below skips the kind filter rather than refusing every
  // named row for a reason the FK already states better.
  const category = tx
    .select({ kind: categories.kind })
    .from(categories)
    .where(eq(categories.id, input.categoryId))
    .get();

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
        // H1-b, batch form — every named row's type must match the
        // category's own kind, not merely be income or expense.
        category === undefined ? undefined : eq(transactions.type, category.kind),
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
    const reason =
      category === undefined
        ? "one is missing, deleted, or a transfer/adjustment (transactions_category_shape)"
        : `one is missing, deleted, a transfer/adjustment, or not ${category.kind} like the ` +
          "category (transactions_category_shape / transactions_category_kind_matches_type)";
    throw new LocalRefusal(
      `categorize_batch: named ${distinctIds} distinct transactions, ${updated.length} were ` +
        `live ${category === undefined ? "income or expense" : category.kind} rows — ${reason}`,
    );
  }

  return updated;
}
