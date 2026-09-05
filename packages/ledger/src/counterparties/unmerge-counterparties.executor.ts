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
 *
 * **Refuses a folded-name collision before un-archiving the loser (R2 H1).**
 * `counterparties_name_uq` is partial — it only covers unarchived rows — so a
 * fresh counterparty can legally take the loser's old name while it sits
 * archived. Flipping `archived` back to `false` here would then hit the raw
 * SQLite `UNIQUE constraint failed` mid-transaction, and the whole unmerge —
 * transaction restores included — would abort with it. Checked the same way
 * `create_counterparty` and `update_counterparty` check it: `name_folded`
 * against every *other* live row, named in the refusal.
 */

import type { Id } from "@waltning/core/id";
import { unmergeCounterpartiesInput } from "@waltning/core/registry/inputs";
import { and, eq, inArray, isNull, ne, sql } from "drizzle-orm";
import { chunkIds } from "../chunk-ids.ts";
import { defineLocalExecutor, LocalRefusal } from "../executor.ts";
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
    throw new LocalRefusal(`unmerge_counterparties: no merge ${mergeId}`, { dependency: true });
  }
  if (merge.unmergedAt !== null) {
    throw new LocalRefusal(`unmerge_counterparties: ${mergeId} was already unmerged`);
  }

  // R2 H1 — `counterparties_name_uq` only covers unarchived rows, so a fresh
  // counterparty may legally have taken the loser's old name while it sat
  // archived. Un-archiving it below would then hit the raw SQLite collision
  // mid-transaction and abort the whole unmerge, restores included — checked
  // first instead, the same way `create_counterparty`/`update_counterparty` do.
  const [loserRow] = tx
    .select({ name: counterparties.name, nameFolded: counterparties.nameFolded })
    .from(counterparties)
    .where(eq(counterparties.id, merge.loserId))
    .all();
  if (!loserRow) {
    throw new LocalRefusal(`unmerge_counterparties: no counterparty ${merge.loserId}`, {
      dependency: true,
    });
  }
  const [collision] = tx
    .select({ id: counterparties.id, name: counterparties.name })
    .from(counterparties)
    .where(
      and(
        eq(counterparties.nameFolded, loserRow.nameFolded),
        eq(counterparties.archived, false),
        ne(counterparties.id, merge.loserId),
      ),
    )
    .all();
  if (collision) {
    throw new LocalRefusal(
      `unmerge_counterparties: un-archiving "${loserRow.name}" collides with existing ` +
        `counterparty "${collision.name}" (${collision.id}) — counterparties_name_uq`,
    );
  }

  const movedIds = merge.movedTransactionIds;

  // R2 H1 — restores only a named row still on the winner. Anything else
  // named — soft-deleted, or reassigned to a third counterparty since the
  // merge — is not repointed, and both cases are counted as `skipped` below
  // rather than silently overwritten.
  //
  // R2 M3 — chunked: `inArray` binds one SQLite variable per id, and a merge
  // that moved more than `SQLITE_MAX_VARIABLE_NUMBER` (999) would otherwise
  // throw "too many SQL variables" instead of restoring anything.
  const restored =
    movedIds.length === 0
      ? []
      : chunkIds(movedIds).flatMap((batch) =>
          tx
            .update(transactions)
            .set({ counterpartyId: merge.loserId })
            .where(
              and(
                inArray(transactions.id, batch),
                isNull(transactions.deletedAt),
                eq(transactions.counterpartyId, merge.winnerId),
              ),
            )
            .returning({ id: transactions.id })
            .all(),
        );

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
