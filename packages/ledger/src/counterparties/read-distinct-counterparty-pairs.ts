/**
 * `record_distinct_counterparties`' own table, read back — S15 §9.1's *"the
 * dismissal is recorded per pair and the question is never asked again."*
 *
 * A small table (one row per dismissal ever recorded), so this is read
 * whole on every refresh rather than filtered server-side — `nearMatches`
 * does the per-pair check client-side, the same way it already folds the
 * threshold and the ranking.
 */

import type { Id } from "@waltning/core/id";
import type { ReplicaDb } from "../open.ts";
import { ledgerSchema } from "../schema-map.ts";

const { counterpartyDistinctPairs } = ledgerSchema;

export function readDistinctCounterpartyPairs<TRun, TSchema extends typeof ledgerSchema>(
  db: ReplicaDb<TRun, TSchema>,
): readonly (readonly [Id<"counterparties">, Id<"counterparties">])[] {
  return db
    .select({ aId: counterpartyDistinctPairs.aId, bId: counterpartyDistinctPairs.bId })
    .from(counterpartyDistinctPairs)
    .all()
    .map((row): readonly [Id<"counterparties">, Id<"counterparties">] => [row.aId, row.bId]);
}
