/**
 * The categories a reader used last — S06's *You used these last*.
 *
 * **Read off D2's own history rather than a query of its own.** That history
 * is one row per entered name, newest first, each carrying the category it was last
 * filed under; the first time a category appears in it is the last time it was
 * used for anyone. Close enough to *last used* to be the answer, and it is the
 * read the sheet's caller already makes for the suggestion above it.
 *
 * `eligible` is the sheet's own leaves — the kind in hand, live, not the seeded
 * blank — so a recent can never name a category the grid below cannot show.
 */

import type { EnteredNameHistoryRow } from "./entered-name-memory.ts";

/** Two rows of the sheet's two columns: the section's height never changes once full. */
export const RECENT_CATEGORIES = 4;

export function recentCategories(
  history: readonly EnteredNameHistoryRow[],
  eligible: ReadonlySet<string>,
  limit: number = RECENT_CATEGORIES,
): readonly string[] {
  const recent: string[] = [];
  for (const row of history) {
    if (recent.length >= limit) break;
    if (!eligible.has(row.categoryId) || recent.includes(row.categoryId)) continue;
    recent.push(row.categoryId);
  }
  return recent;
}
