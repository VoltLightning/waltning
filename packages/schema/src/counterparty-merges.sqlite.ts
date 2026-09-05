import type { Id } from "@waltning/core/id";
import { sql } from "drizzle-orm";
import { check, uniqueIndex } from "drizzle-orm/sqlite-core";
import { counterparties } from "./counterparties.sqlite.ts";
import { sqliteKit as k } from "./kit.ts";

/**
 * The record S15 §9.2 says makes unmerge exact — *"the absorbed counterparty
 * is archived, not deleted, and the merge records exactly which transactions
 * moved. Unmerge restores them and un-archives it."*
 *
 * `movedTransactionIds` is the whole mechanism: `unmerge_counterparties`
 * reverses precisely this list rather than re-deriving "everything currently
 * pointing at the winner that used to point at the loser" — a re-derivation
 * would also catch a transaction created *after* the merge and mistakenly
 * hand it back to an archived counterparty.
 *
 * **Not bare, the same exception `counterparty-distinct-pairs.sqlite.ts`
 * makes.** `merge_counterparties` runs only on the phone this arc — there is
 * no server operation yet to catch what the executor's own checks miss — so
 * the `winner <> loser` CHECK (M2) and the partial unique index on an open
 * merge's `loser_id` (R2 H2 — a counterparty cannot be absorbed twice while
 * either merge is still live) are declared here directly rather than trusted
 * to `packages/db` alone.
 */
export const counterpartyMergesColumns = () => ({
  id: k.id<"counterpartyMerges">("id"),
  winnerId: k
    .uuid<"counterparties">("winner_id")
    .notNull()
    .references(() => counterparties.id),
  loserId: k
    .uuid<"counterparties">("loser_id")
    .notNull()
    .references(() => counterparties.id),
  /** JSON array of the transaction ids repointed by this merge. */
  movedTransactionIds: k
    .json<readonly Id<"transactions">[]>("moved_transaction_ids")
    .notNull()
    .default([]),
  mergedAt: k.stamp("merged_at"),
  /** Null until `unmerge_counterparties` reverses this record. */
  unmergedAt: k.timestamp("unmerged_at"),
});

export const counterpartyMerges = k.table(
  "counterparty_merges",
  counterpartyMergesColumns(),
  (t) => [
    check("counterparty_merges_winner_ne_loser", sql`${t.winnerId} <> ${t.loserId}`),
    uniqueIndex("counterparty_merges_loser_open_uq")
      .on(t.loserId)
      .where(sql`${t.unmergedAt} is null`),
  ],
);
