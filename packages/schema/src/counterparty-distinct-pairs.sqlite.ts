import { sql } from "drizzle-orm";
import { check, primaryKey } from "drizzle-orm/sqlite-core";
import { counterparties } from "./counterparties.sqlite.ts";
import { sqliteKit as k } from "./kit.ts";

/**
 * S15 §9.1's *these are different* decision, recorded so `MatchWarning` never
 * asks about the same pair twice. Ordered `a_id < b_id` — a pair has no
 * direction, and normalising the order once here is what lets a single row
 * answer the question regardless of which counterparty was on screen when the
 * decision was made. `record_distinct_counterparties`'s executor normalises
 * before it writes; the CHECK below is the guarantee that holds even if it
 * did not.
 *
 * **Not bare, unlike most SQLite twins in this package.** The phone is the
 * only place `record_distinct_counterparties` runs this arc — there is no
 * server yet to catch a caller that skipped normalisation — so the primary
 * key and the ordering CHECK are declared here directly, the same exception
 * `counterparties.sqlite.ts` makes for its name index.
 */
export const counterpartyDistinctPairsColumns = () => ({
  aId: k
    .uuid<"counterparties">("a_id")
    .notNull()
    .references(() => counterparties.id),
  bId: k
    .uuid<"counterparties">("b_id")
    .notNull()
    .references(() => counterparties.id),
});

export const counterpartyDistinctPairs = k.table(
  "counterparty_distinct_pairs",
  counterpartyDistinctPairsColumns(),
  (t) => [
    primaryKey({ columns: [t.aId, t.bId] }),
    check("counterparty_distinct_pairs_ordered", sql`${t.aId} < ${t.bId}`),
  ],
);
