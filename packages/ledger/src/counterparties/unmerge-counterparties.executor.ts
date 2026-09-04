/**
 * `unmerge_counterparties`, on the device — S15 §9.2: *"unmerge restores
 * them and un-archives it."*
 *
 * **Reverses exactly the recorded ids**, never "everything currently
 * pointing at the winner" — the same reason `counterparty_merges` records
 * the moved set rather than leaving unmerge to re-derive it: a transaction
 * created *after* the merge would otherwise be mistakenly handed back to a
 * counterparty that had nothing to do with it.
 *
 * A row soft-deleted since the merge is skipped, not restored, and counted
 * as skipped rather than restored — there is nothing live to repoint.
 */

import type { Id } from "@waltning/core/id";
import { unmergeCounterpartiesInput } from "@waltning/core/registry/inputs";
import { and, eq, inArray, isNotNull, isNull, sql } from "drizzle-orm";
import { defineLocalExecutor } from "../executor.ts";
import { ledgerSchema as schema } from "../schema-map.ts";
import type { LocalTx } from "../write.ts";
import type { LocalCounterpartyRow } from "./create-counterparty.executor.ts";
import type { LocalCounterpartyMergeRow } from "./merge-counterparties.executor.ts";

const { counterparties, counterpartyMerges, transactions } = schema;
type ReplicaTx = LocalTx<unknown, typeof schema>;

export type UnmergeCounterpartiesResult = {
  merge: LocalCounterpartyMergeRow;
  loser: LocalCounterpartyRow;
  restoredTransactions: number;
  skipped: number;
};

export const unmergeCounterpartiesExecutor = defineLocalExecutor<
  typeof unmergeCounterpartiesInput,
  UnmergeCounterpartiesResult,
  ReplicaTx
>({
  operation: "unmerge_counterparties",
  opVersion: 1,
  input: unmergeCounterpartiesInput,
  mints: () => [],
  apply: (input, tx) => unmergeCounterparties(input.mergeId, tx),
});

function unmergeCounterparties(
  mergeId: Id<"counterpartyMerges">,
  tx: ReplicaTx,
): UnmergeCounterpartiesResult {
  const [merge] = tx
    .select()
    .from(counterpartyMerges)
    .where(eq(counterpartyMerges.id, mergeId))
    .all();
  if (!merge) {
    throw new Error(`unmerge_counterparties: no merge ${mergeId}`);
  }
  if (merge.unmergedAt !== null) {
    throw new Error(`unmerge_counterparties: ${mergeId} was already unmerged`);
  }

  const movedIds = merge.movedTransactionIds;

  const restored =
    movedIds.length === 0
      ? []
      : tx
          .update(transactions)
          .set({ counterpartyId: merge.loserId })
          .where(and(inArray(transactions.id, movedIds), isNull(transactions.deletedAt)))
          .returning({ id: transactions.id })
          .all();

  const skipped =
    movedIds.length === 0
      ? 0
      : tx
          .select({ id: transactions.id })
          .from(transactions)
          .where(and(inArray(transactions.id, movedIds), isNotNull(transactions.deletedAt)))
          .all().length;

  const [unarchivedLoser] = tx
    .update(counterparties)
    .set({ archived: false, version: sql`${counterparties.version} + 1`, updatedAt: new Date() })
    .where(eq(counterparties.id, merge.loserId))
    .returning()
    .all();
  if (!unarchivedLoser) {
    throw new Error("unmerge_counterparties: the loser row changed between read and write");
  }

  const [unmergedRow] = tx
    .update(counterpartyMerges)
    .set({ unmergedAt: new Date() })
    .where(eq(counterpartyMerges.id, mergeId))
    .returning()
    .all();
  if (!unmergedRow) {
    throw new Error("unmerge_counterparties: the merge row changed between read and write");
  }

  return {
    merge: unmergedRow,
    loser: unarchivedLoser,
    restoredTransactions: restored.length,
    skipped,
  };
}
