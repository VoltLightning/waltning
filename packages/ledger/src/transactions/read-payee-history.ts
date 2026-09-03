import { fold } from "@waltning/core/capture/names";
import type { PayeeHistoryRow } from "@waltning/core/capture/payee-memory";
import { and, desc, inArray, isNotNull, isNull } from "drizzle-orm";
import type { ReplicaDb } from "../open.ts";
import { ledgerSchema } from "../schema-map.ts";

const { transactions } = ledgerSchema;

/**
 * D2's history for `proposeCategory`: one row per distinct **folded** payee —
 * its most recent category and the date that category was last used — over
 * live income/expense rows that carry a category. Newest first, `limit`
 * distinct payees.
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
    .where(
      and(
        isNull(transactions.deletedAt),
        isNotNull(transactions.categoryId),
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
