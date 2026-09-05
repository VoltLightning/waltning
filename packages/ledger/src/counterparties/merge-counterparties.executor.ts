/**
 * `merge_counterparties`, on the device — S15 §9.2: *"the absorbed
 * counterparty is archived, not deleted, and the merge records exactly which
 * transactions moved."*
 *
 * Every transaction that ends up moved is repointed to `winnerId`, the moved
 * ids are recorded on a `counterparty_merges` row, and the loser is archived
 * (never deleted — §6.9). `unmerge_counterparties` reverses precisely that
 * recorded list. **Which ids "end up moved" has two paths (R2 H5 —
 * `namedMovedRows` and `mergeCounterparties` below):** a caller that named
 * them explicitly (its own pre-read of the replica) gets exactly that list,
 * refused if any of it no longer names the loser; a caller with nothing to
 * name gets whatever this transaction discovers pointing at the loser right
 * now, atomically. Both are recorded the same way, and `listCounterpartyMerges`
 * reads either back the same way.
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
 *
 * **Asserts the loser is actually empty before archiving it (R2 L3).** The
 * named path's stale check only catches a *named* id reassigned away from
 * the loser; it says nothing about a live row the controller never named at
 * all — one captured after the sheet read the loser's transactions, say.
 * Rather than archive a counterparty that still has a live transaction
 * pointing at it (invisible from then on — S12 only lists unarchived
 * counterparties), this refuses the whole merge instead.
 */

import type { Id } from "@waltning/core/id";
import {
  type MergeCounterpartiesInput,
  mergeCounterpartiesInput,
} from "@waltning/core/registry/inputs";
import { and, eq, inArray, isNull, or, sql } from "drizzle-orm";
import { defineLocalExecutor, LocalRefusal } from "../executor.ts";
import { ledgerSchema as schema } from "../schema-map.ts";
import type { LocalTx } from "../write.ts";
import { chunkIds } from "./chunk-ids.ts";
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

/**
 * The caller-named half of R2 H5 — refuses if any named id no longer points
 * at the loser, then moves exactly the named ids. Chunked (R2 M3): a single
 * `inArray` over every named id binds one SQLite variable per id, and a move
 * past `SQLITE_MAX_VARIABLE_NUMBER` (999) would otherwise throw "too many
 * SQL variables" instead of the refusal below.
 */
function namedMovedRows(
  tx: ReplicaTx,
  loserId: Id<"counterparties">,
  winnerId: Id<"counterparties">,
  movedTransactionIds: readonly Id<"transactions">[],
): { id: Id<"transactions"> }[] {
  if (movedTransactionIds.length === 0) return [];
  const named = chunkIds(movedTransactionIds).flatMap((batch) =>
    tx
      .select({ id: transactions.id, counterpartyId: transactions.counterpartyId })
      .from(transactions)
      .where(inArray(transactions.id, batch))
      .all(),
  );
  const counterpartyById = new Map(named.map((row) => [row.id, row.counterpartyId]));
  const stale = movedTransactionIds.filter((id) => counterpartyById.get(id) !== loserId);
  if (stale.length > 0) {
    throw new LocalRefusal(
      `merge_counterparties: ${stale.length} named transaction(s) no longer name ` +
        `${loserId} (${stale.join(", ")}) — reload and try again`,
    );
  }
  return chunkIds(movedTransactionIds).flatMap((batch) =>
    tx
      .update(transactions)
      .set({ counterpartyId: winnerId })
      .where(inArray(transactions.id, batch))
      .returning({ id: transactions.id })
      .all(),
  );
}

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
  if (!winner) throw new LocalRefusal(`merge_counterparties: no counterparty ${input.winnerId}`);
  if (!loser) throw new LocalRefusal(`merge_counterparties: no counterparty ${input.loserId}`);
  if (winner.archived) {
    throw new LocalRefusal(`merge_counterparties: ${input.winnerId} is archived`);
  }
  if (loser.archived) {
    throw new LocalRefusal(`merge_counterparties: ${input.loserId} is already archived`);
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
    throw new LocalRefusal(
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
    throw new LocalRefusal(
      `merge_counterparties: ${input.winnerId} and ${input.loserId} were recorded as distinct ` +
        "(S15 §9.1) — record_distinct_counterparties would need reversing first",
    );
  }

  // R2 H5 — a caller with its own pre-read (`create-phone-ledger.ts`'s
  // `mergeCounterparties` action, paging `searchTransactions`) names exactly
  // the ids it saw, and this refuses one that no longer names the loser: a
  // concurrent write already reassigned it, and silently dropping it from
  // the moved set would move a different set than the controller — and the
  // person — saw. A caller with no such pre-read (this operation's own
  // fixtures included) omits the field entirely and gets the ids this
  // transaction discovers for itself, below — never a mix of the two, since
  // an omitted list is `undefined`, not `[]`.
  const movedRows = input.movedTransactionIds
    ? namedMovedRows(tx, input.loserId, input.winnerId, input.movedTransactionIds)
    : tx
        .update(transactions)
        .set({ counterpartyId: input.winnerId })
        .where(and(eq(transactions.counterpartyId, input.loserId), isNull(transactions.deletedAt)))
        .returning({ id: transactions.id })
        .all();

  // R2 L3 — the named path's stale check only catches a *named* id
  // reassigned away from the loser; it says nothing about a live transaction
  // the controller never named at all. Asserted straight after the move
  // rather than trusted: archiving a counterparty that still holds a live
  // transaction would make that row's counterparty vanish from S12, which
  // only lists unarchived rows. Refused, not archived, if one turns up.
  const [stillLive] = tx
    .select({ id: transactions.id })
    .from(transactions)
    .where(and(eq(transactions.counterpartyId, input.loserId), isNull(transactions.deletedAt)))
    .limit(1)
    .all();
  if (stillLive) {
    throw new LocalRefusal(
      `merge_counterparties: ${input.loserId} still has a live transaction ` +
        `(${stillLive.id}) after the move — refusing to archive it`,
    );
  }

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
  // insert gives. Both paths above would in any case be caught earlier on a
  // replay: a named list is stale by then (its ids now point at `winnerId`,
  // not `loserId`), and a discovered list reads back empty for the same
  // reason — either way `loser.archived` refuses the second attempt before
  // this insert is reached. That never fires today, but a silently-empty
  // `movedTransactionIds` is the wrong failure mode to leave reachable by a
  // future change to that guard; a duplicate `mergeId` now fails loudly
  // instead.
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
