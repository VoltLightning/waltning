/**
 * What `merge_counterparties` does to the loser's opening debts (§6.6), and the
 * way back for `unmerge_counterparties`.
 *
 * An opening debt is one live row per person per currency, so absorbing a
 * person cannot just repoint the rows: where the winner already has one in the
 * same currency the two would collide. The rule is the signed sum.
 *
 * - **The winner has none in that currency** — the row changes owner (`moved`).
 * - **The winner has one** — the two are summed into the winner's row, by sign
 *   (`theyOwe` positive): the winner's row takes the larger magnitude's
 *   direction and the earlier date, the loser's row is soft-deleted, and the
 *   repayments that drew on the loser's row are pointed at the winner's
 *   (`combined`).
 * - **They cancel to nothing** — both rows are soft-deleted and the repayments
 *   stay on the winner's, now deleted, row (`cancelled`).
 *
 * Every step is recorded on the merge row (`MovedOpeningDebt`) with what the
 * winner's row held before, so unmerge restores exactly that and nothing a
 * person did since: a row deleted or re-recorded after the merge is left as it
 * is, the same "undo its own move" rule the transactions follow.
 */

import { type Id, id } from "@waltning/core/id";
import * as money from "@waltning/core/money";
import { and, eq, isNull } from "drizzle-orm";
import { LocalRefusal } from "../executor.ts";
import { type ReplicaTx, ledgerSchema as schema } from "../schema-map.ts";

const { openingDebts, transactions } = schema;

type MovedOpeningDebt =
  (typeof schema.counterpartyMerges.$inferSelect)["movedOpeningDebts"][number];

const signed = (row: { direction: "theyOwe" | "youOwe"; amount: money.Money }): money.Money =>
  row.direction === "theyOwe" ? row.amount : money.neg(row.amount);

export function mergeOpeningDebts(
  tx: ReplicaTx,
  loserId: Id<"counterparties">,
  winnerId: Id<"counterparties">,
): readonly MovedOpeningDebt[] {
  const now = new Date();
  const losers = tx
    .select()
    .from(openingDebts)
    .where(and(eq(openingDebts.counterpartyId, loserId), isNull(openingDebts.deletedAt)))
    .all();
  const moved: MovedOpeningDebt[] = [];

  for (const loser of losers) {
    const [winner] = tx
      .select()
      .from(openingDebts)
      .where(
        and(
          eq(openingDebts.counterpartyId, winnerId),
          eq(openingDebts.currency, loser.currency),
          isNull(openingDebts.deletedAt),
        ),
      )
      .all();

    if (!winner) {
      tx.update(openingDebts)
        .set({ counterpartyId: winnerId, updatedAt: now })
        .where(eq(openingDebts.id, loser.id))
        .run();
      moved.push({ mode: "moved", id: loser.id });
      continue;
    }

    const sum = money.add(signed(winner), signed(loser));
    if (!money.amountWithinCeiling(money.abs(sum))) {
      throw new LocalRefusal(
        `merge_counterparties: the two existing debts in ${loser.currency} sum past ` +
          `${money.AMOUNT_CEILING_DISPLAY} — settle one of them first`,
      );
    }

    // The loser's repayments now draw on the winner's row.
    const relinked = tx
      .update(transactions)
      .set({ settlesOpeningDebtId: winner.id })
      .where(and(eq(transactions.settlesOpeningDebtId, loser.id), isNull(transactions.deletedAt)))
      .returning({ id: transactions.id })
      .all()
      .map((row) => row.id as string);

    const winnerBefore = {
      direction: winner.direction,
      amount: winner.amount as string,
      date: winner.date as string,
    };
    // Soft-delete the loser's row first: the partial unique index is on live
    // rows, and nothing collides, but this keeps the order the unmerge reverses.
    tx.update(openingDebts)
      .set({ deletedAt: now, updatedAt: now })
      .where(eq(openingDebts.id, loser.id))
      .run();

    if (money.isZero(sum)) {
      tx.update(openingDebts)
        .set({ deletedAt: now, updatedAt: now })
        .where(eq(openingDebts.id, winner.id))
        .run();
      moved.push({
        mode: "cancelled",
        id: loser.id,
        into: winner.id,
        winnerBefore,
        relinked,
        after: { ...winnerBefore, deleted: true },
      });
      continue;
    }

    tx.update(openingDebts)
      .set({
        direction: money.cmp(sum, money.ZERO) > 0 ? "theyOwe" : "youOwe",
        amount: money.abs(sum),
        date: loser.date < winner.date ? loser.date : winner.date,
        updatedAt: now,
      })
      .where(eq(openingDebts.id, winner.id))
      .run();
    const after = {
      direction: money.cmp(sum, money.ZERO) > 0 ? ("theyOwe" as const) : ("youOwe" as const),
      amount: money.abs(sum) as string,
      date: (loser.date < winner.date ? loser.date : winner.date) as string,
      deleted: false,
    };
    moved.push({ mode: "combined", id: loser.id, into: winner.id, winnerBefore, relinked, after });
  }
  return moved;
}

/**
 * Reverses `mergeOpeningDebts` from the record it left. Returns how many
 * entries were **left alone** because the winner's row no longer holds what the
 * merge left it — a correction made since is somebody's decision, and unmerge
 * undoes its own move, never a later one (the loser's debt is then not handed
 * back either, since the winner's figure already includes it).
 */
export function unmergeOpeningDebts(
  tx: ReplicaTx,
  loserId: Id<"counterparties">,
  winnerId: Id<"counterparties">,
  recorded: readonly MovedOpeningDebt[],
): number {
  const now = new Date();
  let kept = 0;
  for (const entry of recorded) {
    if (entry.mode === "moved") {
      // Back to the loser — only if it is still the winner's and still live.
      const [back] = tx
        .update(openingDebts)
        .set({ counterpartyId: loserId, updatedAt: now })
        .where(
          and(
            eq(openingDebts.id, id<"openingDebts">(entry.id)),
            eq(openingDebts.counterpartyId, winnerId),
            isNull(openingDebts.deletedAt),
          ),
        )
        .returning({ id: openingDebts.id })
        .all();
      if (!back) kept += 1;
      continue;
    }

    const [winner] = tx
      .select()
      .from(openingDebts)
      .where(eq(openingDebts.id, id<"openingDebts">(entry.into)))
      .all();
    const untouched =
      winner !== undefined &&
      (winner.deletedAt !== null) === entry.after.deleted &&
      winner.direction === entry.after.direction &&
      money.eq(winner.amount, entry.after.amount as money.Money) &&
      winner.date === entry.after.date;
    if (!untouched) {
      kept += 1;
      continue;
    }

    tx.update(openingDebts)
      .set({
        direction: entry.winnerBefore.direction,
        amount: entry.winnerBefore.amount as money.Money,
        date: entry.winnerBefore.date as typeof winner.date,
        deletedAt: null,
        updatedAt: now,
      })
      .where(eq(openingDebts.id, id<"openingDebts">(entry.into)))
      .run();
    tx.update(openingDebts)
      .set({ deletedAt: null, updatedAt: now })
      .where(eq(openingDebts.id, id<"openingDebts">(entry.id)))
      .run();
    for (const repaymentId of entry.relinked) {
      tx.update(transactions)
        .set({ settlesOpeningDebtId: id<"openingDebts">(entry.id) })
        .where(
          and(
            eq(transactions.id, id<"transactions">(repaymentId)),
            eq(transactions.settlesOpeningDebtId, id<"openingDebts">(entry.into)),
          ),
        )
        .run();
    }
  }
  return kept;
}
