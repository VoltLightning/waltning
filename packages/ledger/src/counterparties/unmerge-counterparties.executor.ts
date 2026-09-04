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
 *
 * **A row repointed away from the winner since the merge is also skipped
 * (R2 H1).** Only a named id still on `winnerId` is repointed —
 * `eq(counterpartyId, winnerId)` — so a later, deliberate reassignment (a
 * person moving that one transaction to a third counterparty by hand) is
 * never overwritten by an unmerge that has nothing to do with it. Counted
 * among `skipped` alongside the soft-deleted case, for the same reason: there
 * is nothing on the winner left to take back.
 */

import type { Id } from "@waltning/core/id";
import { unmergeCounterpartiesInput } from "@waltning/core/registry/inputs";
import { and, eq, inArray, isNull, sql } from "drizzle-orm";
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

  // R2 H1 — restores only a named row still on the winner. Anything else
  // named — soft-deleted, or reassigned to a third counterparty since the
  // merge — is not repointed, and both cases are counted as `skipped` below
  // rather than silently overwritten.
  const restored =
    movedIds.length === 0
      ? []
      : tx
          .update(transactions)
          .set({ counterpartyId: merge.loserId })
          .where(
            and(
              inArray(transactions.id, movedIds),
              isNull(transactions.deletedAt),
              eq(transactions.counterpartyId, merge.winnerId),
            ),
          )
          .returning({ id: transactions.id })
          .all();

  const skipped = movedIds.length - restored.length;

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
