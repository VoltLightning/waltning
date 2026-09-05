import { fold } from "@waltning/core/capture/names";
import type { PayeeHistoryRow } from "@waltning/core/capture/payee-memory";
import { and, desc, eq, inArray, isNotNull, isNull } from "drizzle-orm";
import type { ReplicaDb } from "../open.ts";
import { ledgerSchema } from "../schema-map.ts";

const { categories, transactions } = ledgerSchema;

/**
 * D2's history for `proposeCategory`: one row per distinct **folded** payee —
 * its most recent category and the date that category was last used — over
 * live income/expense rows that carry a category. Newest first, `limit`
 * distinct payees.
 *
 * **Archived categories are excluded, here rather than at the caller.** H1a:
 * this is D2's *proposal* source, and `listCategories` — the list every picker
 * and every chip is drawn from — already drops archived rows. A history that
 * kept them proposed a category no surface offers and none could display, so
 * the bar auto-filled an id it then rendered as "Category?" and Enter saved
 * it. The join is what makes the two lists agree: a payee whose last
 * categorised row sits on a since-archived leaf simply has no proposal, and
 * the chip asks instead of guessing.
 *
 * Grouping happens in application code, not SQL: `fold()` strips case and
 * diacritics the way Postgres `unaccent` would, and SQLite has no equivalent.
 * The rows are read newest-first, so the first occurrence of a folded payee
 * is by construction its most recent — the same "keep the first, skip
 * repeats" shape `readRecent` and `readAccounts` already use for ordered
 * dedup.
 */
export function readPayeeHistory<TRun, TSchema extends typeof ledgerSchema>(
  db: ReplicaDb<TRun, TSchema>,
  limit = 2000,
): readonly PayeeHistoryRow[] {
  if (!Number.isInteger(limit) || limit < 1) {
    throw new Error(`payee history limit must be a positive integer, got ${limit}`);
  }

  const rows = db
    .select({
      payee: transactions.payee,
      categoryId: transactions.categoryId,
      date: transactions.date,
    })
    .from(transactions)
    .innerJoin(categories, eq(categories.id, transactions.categoryId))
    .where(
      and(
        isNull(transactions.deletedAt),
        isNotNull(transactions.categoryId),
        eq(categories.archived, false),
        inArray(transactions.type, ["income", "expense"]),
      ),
    )
    .orderBy(desc(transactions.date), desc(transactions.createdAt), desc(transactions.id))
    .all();

  const seen = new Set<string>();
  const history: PayeeHistoryRow[] = [];
  for (const row of rows) {
    if (row.categoryId === null) continue;
    const key = fold(row.payee);
    if (seen.has(key)) continue;
    seen.add(key);
    history.push({ payee: row.payee, categoryId: row.categoryId, date: row.date });
    if (history.length >= limit) break;
  }
  return history;
}
