/**
 * `merge_counterparties`, on the device — S15 §9.2: *"the absorbed
 * counterparty is archived, not deleted, and the merge records exactly which
 * transactions moved."*
 *
 * Every live transaction naming `loserId` is repointed to `winnerId`, the
 * moved ids are recorded on a `counterparty_merges` row, and the loser is
 * archived (never deleted — §6.9). `unmerge_counterparties` reverses
 * precisely that recorded list.
 *
 * **This deliberately differs from `merge_categories` (J12), which is not
 * reversible in one step.** A counterparty merge only re-points a foreign
 * key, so the absorbed record can be kept whole and the operation genuinely
 * inverted — S15 §9.2 states the asymmetry is real.
 */

import {
  type MergeCounterpartiesInput,
  mergeCounterpartiesInput,
} from "@waltning/core/registry/inputs";
import { and, eq, isNull, sql } from "drizzle-orm";
import { defineLocalExecutor } from "../executor.ts";
import { ledgerSchema as schema } from "../schema-map.ts";
import type { LocalTx } from "../write.ts";
import type { LocalCounterpartyRow } from "./create-counterparty.executor.ts";

const { counterparties, counterpartyDistinctPairs, counterpartyMerges, transactions } = schema;
type ReplicaTx = LocalTx<unknown, typeof schema>;

export type LocalCounterpartyMergeRow = typeof counterpartyMerges.$inferSelect;

export type MergeCounterpartiesResult = {
  merge: LocalCounterpartyMergeRow;
  loser: LocalCounterpartyRow;
  movedTransactions: number;
};

export const mergeCounterpartiesExecutor = defineLocalExecutor<
  typeof mergeCounterpartiesInput,
  MergeCounterpartiesResult,
  ReplicaTx
>({
  operation: "merge_counterparties",
  opVersion: 1,
  input: mergeCounterpartiesInput,
  /** The merge record — the one row this write brings into existence. */
  mints: (input) => [input.mergeId],
  apply: (input, tx) => mergeCounterparties(input, tx),
});

function mergeCounterparties(
  input: MergeCounterpartiesInput,
  tx: ReplicaTx,
): MergeCounterpartiesResult {
  const [winner] = tx
    .select()
    .from(counterparties)
    .where(eq(counterparties.id, input.winnerId))
    .all();
  const [loser] = tx
    .select()
    .from(counterparties)
    .where(eq(counterparties.id, input.loserId))
    .all();
  if (!winner) throw new Error(`merge_counterparties: no counterparty ${input.winnerId}`);
  if (!loser) throw new Error(`merge_counterparties: no counterparty ${input.loserId}`);
  if (winner.archived) {
    throw new Error(`merge_counterparties: ${input.winnerId} is archived`);
  }
  if (loser.archived) {
    throw new Error(`merge_counterparties: ${input.loserId} is already archived`);
  }

  // The ordering `counterparty_distinct_pairs_ordered` requires, same rule
  // `record_distinct_counterparties` normalises to before it writes.
  const [aId, bId] =
    input.winnerId < input.loserId
      ? [input.winnerId, input.loserId]
      : [input.loserId, input.winnerId];
  const [distinct] = tx
    .select({ aId: counterpartyDistinctPairs.aId })
    .from(counterpartyDistinctPairs)
    .where(and(eq(counterpartyDistinctPairs.aId, aId), eq(counterpartyDistinctPairs.bId, bId)))
    .all();
  if (distinct) {
    throw new Error(
      `merge_counterparties: ${input.winnerId} and ${input.loserId} were recorded as distinct ` +
        "(S15 §9.1) — record_distinct_counterparties would need reversing first",
    );
  }

  const movedRows = tx
    .update(transactions)
    .set({ counterpartyId: input.winnerId })
    .where(and(eq(transactions.counterpartyId, input.loserId), isNull(transactions.deletedAt)))
    .returning({ id: transactions.id })
    .all();

  const [mergeRow] = tx
    .insert(counterpartyMerges)
    .values({
      id: input.mergeId,
      winnerId: input.winnerId,
      loserId: input.loserId,
      movedTransactionIds: movedRows.map((row) => row.id),
    })
    .onConflictDoUpdate({
      target: counterpartyMerges.id,
      set: {
        winnerId: input.winnerId,
        loserId: input.loserId,
        movedTransactionIds: movedRows.map((row) => row.id),
      },
    })
    .returning()
    .all();
  if (!mergeRow) {
    throw new Error("merge_counterparties: the merge insert returned no row");
  }

  const [archivedLoser] = tx
    .update(counterparties)
    .set({ archived: true, version: sql`${counterparties.version} + 1`, updatedAt: new Date() })
    .where(eq(counterparties.id, input.loserId))
    .returning()
    .all();
  if (!archivedLoser) {
    throw new Error("merge_counterparties: the loser row changed between read and write");
  }

  return { merge: mergeRow, loser: archivedLoser, movedTransactions: movedRows.length };
}
