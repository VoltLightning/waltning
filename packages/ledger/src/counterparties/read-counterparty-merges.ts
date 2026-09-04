/**
 * Merges into one counterparty, still live — S13's overflow: *"Merged Marek
 * into this record · 3 rows · Undo."* `merge_counterparties` (`#e2`) already
 * writes `counterparty_merges`; this is the first read path over it.
 *
 * **`unmerged_at is null` only** — an already-undone merge has nothing left
 * to offer S13's overflow, the same reason `unmerge_counterparties` itself
 * refuses a second attempt at one.
 */

import type { Id } from "@waltning/core/id";
import { and, desc, eq, isNull } from "drizzle-orm";
import type { ReplicaDb } from "../open.ts";
import { ledgerSchema } from "../schema-map.ts";

const { counterparties, counterpartyMerges } = ledgerSchema;

export type LocalCounterpartyMerge = {
  mergeId: Id<"counterpartyMerges">;
  /** The absorbed counterparty's own name — archived, not deleted (S15 §9.2), so it is still on hand to show. */
  loserName: string;
  mergedAt: Date;
  /** How many transactions this merge repointed — `movedTransactionIds.length`, not a second count. */
  movedCount: number;
};

export function readCounterpartyMerges<TRun, TSchema extends typeof ledgerSchema>(
  db: ReplicaDb<TRun, TSchema>,
  winnerId: Id<"counterparties">,
): readonly LocalCounterpartyMerge[] {
  return db
    .select({
      mergeId: counterpartyMerges.id,
      loserName: counterparties.name,
      mergedAt: counterpartyMerges.mergedAt,
      movedTransactionIds: counterpartyMerges.movedTransactionIds,
    })
    .from(counterpartyMerges)
    .innerJoin(counterparties, eq(counterpartyMerges.loserId, counterparties.id))
    .where(and(eq(counterpartyMerges.winnerId, winnerId), isNull(counterpartyMerges.unmergedAt)))
    .orderBy(desc(counterpartyMerges.mergedAt))
    .all()
    .map((row) => ({
      mergeId: row.mergeId,
      loserName: row.loserName,
      mergedAt: row.mergedAt,
      movedCount: row.movedTransactionIds.length,
    }));
}
