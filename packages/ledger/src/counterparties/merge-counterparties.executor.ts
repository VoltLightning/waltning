/**
 * `merge_counterparties`, on the device — S15 §9.2: *"the absorbed
 * counterparty is archived, not deleted, and the merge records exactly which
 * transactions moved."*
 *
 * Exactly the transactions the controller named are repointed to
 * `winnerId` (R2 H5 — see `apply` below), the moved ids are recorded on a
 * `counterparty_merges` row, and the loser is archived (never deleted —
 * §6.9). `unmerge_counterparties` reverses precisely that recorded list.
 *
 * **This deliberately differs from `merge_categories` (J12), which is not
 * reversible in one step.** A counterparty merge only re-points a foreign
 * key, so the absorbed record can be kept whole and the operation genuinely
 * inverted — S15 §9.2 states the asymmetry is real.
 *
 * **Refuses a chained merge (R2 H2).** A→B then B→C would reverse into the
 * wrong owner: unmerging A→B after C exists hands A's transactions back to
 * B, which C has since absorbed. Refused whenever either id already appears,
 * as either role, on a merge that is still open (`unmerged_at is null`).
 */

import {
  type MergeCounterpartiesInput,
  mergeCounterpartiesInput,
} from "@waltning/core/registry/inputs";
import { and, eq, inArray, isNull, or, sql } from "drizzle-orm";
import { defineLocalExecutor } from "../executor.ts";
import { ledgerSchema as schema } from "../schema-map.ts";
import type { LocalTx } from "../write.ts";
import type { LocalCounterpartyRow } from "./create-counterparty.executor.ts";

const {
  counterparties,
  counterpartyDistinctPairs,
  counterpartyMerges,
  recurringTransactions,
  transactions,
} = schema;
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

  // R2 H2 — neither id may already sit on an open merge, as either role. A→B
  // then B→C would let an unmerge of A→B hand A's rows back to B after C had
  // already absorbed them.
  const openConflicts = tx
    .select({ id: counterpartyMerges.id })
    .from(counterpartyMerges)
    .where(
      and(
        isNull(counterpartyMerges.unmergedAt),
        or(
          eq(counterpartyMerges.winnerId, input.winnerId),
          eq(counterpartyMerges.loserId, input.winnerId),
          eq(counterpartyMerges.winnerId, input.loserId),
          eq(counterpartyMerges.loserId, input.loserId),
        ),
      ),
    )
    .all();
  if (openConflicts.length > 0) {
    throw new Error(
      `merge_counterparties: ${input.winnerId} or ${input.loserId} already appears on an open ` +
        `merge (${openConflicts.map((row) => row.id).join(", ")}) — unmerge it first`,
    );
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

  // R2 H5 — moves exactly the ids the controller named (computed from the
  // replica it could see), never "everything currently pointing at the
  // loser" — the same reason `unmerge_counterparties` reverses a recorded
  // list rather than re-deriving one. Refuses if any named id no longer
  // points at the loser: a concurrent write already reassigned it, and
  // silently dropping it from the moved set would move a different set than
  // the controller — and the person — saw.
  if (input.movedTransactionIds.length > 0) {
    const named = tx
      .select({ id: transactions.id, counterpartyId: transactions.counterpartyId })
      .from(transactions)
      .where(inArray(transactions.id, input.movedTransactionIds))
      .all();
    const counterpartyById = new Map(named.map((row) => [row.id, row.counterpartyId]));
    const stale = input.movedTransactionIds.filter(
      (id) => counterpartyById.get(id) !== input.loserId,
    );
    if (stale.length > 0) {
      throw new Error(
        `merge_counterparties: ${stale.length} named transaction(s) no longer name ` +
          `${input.loserId} (${stale.join(", ")}) — reload and try again`,
      );
    }
  }

  const movedRows =
    input.movedTransactionIds.length === 0
      ? []
      : tx
          .update(transactions)
          .set({ counterpartyId: input.winnerId })
          .where(inArray(transactions.id, input.movedTransactionIds))
          .returning({ id: transactions.id })
          .all();

  // R2 M1 — a recurring rule has no per-write "which ones moved" list the
  // way a transaction does (there is no `unmerge` half for these — S15 §9.2
  // says nothing about reversing a rule's counterparty), so every rule still
  // naming the loser is repointed unconditionally rather than left stranded
  // on an archived counterparty.
  tx.update(recurringTransactions)
    .set({ counterpartyId: input.winnerId })
    .where(eq(recurringTransactions.counterpartyId, input.loserId))
    .run();

  // A plain insert, not `onConflictDoUpdate` — the entry mints `mergeId`
  // (`mints` above), so a genuine replay of this exact write is "twice is
  // once" by the id, the same H13 argument `create_counterparty`'s idempotent
  // insert gives. A replay would in any case be caught earlier: the named
  // ids in `input.movedTransactionIds` now point at `winnerId`, not
  // `loserId`, so the H5 stale check above refuses it before this insert is
  // ever reached — a duplicate `mergeId` would otherwise fail loudly here.
  const [mergeRow] = tx
    .insert(counterpartyMerges)
    .values({
      id: input.mergeId,
      winnerId: input.winnerId,
      loserId: input.loserId,
      movedTransactionIds: movedRows.map((row) => row.id),
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

  // R2 M1 — distinct-pairs are transitive across a merge. Whoever the loser
  // was recorded distinct from (S15 §9.1), the winner now stands in for, so
  // the winner inherits every one of the loser's pairs against a *third*
  // party — never against the winner itself, which the check above already
  // refuses ever reaching this point.
  const loserPairs = tx
    .select({ aId: counterpartyDistinctPairs.aId, bId: counterpartyDistinctPairs.bId })
    .from(counterpartyDistinctPairs)
    .where(
      or(
        eq(counterpartyDistinctPairs.aId, input.loserId),
        eq(counterpartyDistinctPairs.bId, input.loserId),
      ),
    )
    .all();
  for (const pair of loserPairs) {
    const other = pair.aId === input.loserId ? pair.bId : pair.aId;
    const [a, b] = input.winnerId < other ? [input.winnerId, other] : [other, input.winnerId];
    tx.insert(counterpartyDistinctPairs)
      .values({ aId: a, bId: b })
      .onConflictDoNothing({
        target: [counterpartyDistinctPairs.aId, counterpartyDistinctPairs.bId],
      })
      .run();
  }

  return { merge: mergeRow, loser: archivedLoser, movedTransactions: movedRows.length };
}
