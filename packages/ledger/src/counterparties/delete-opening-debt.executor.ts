/**
 * `delete_opening_debt`, on the device — §6.6: an existing debt can be taken
 * out, and **taking it out takes the whole chain with it**: every repayment
 * made against it (`transactions.settles_opening_debt_id`) is deleted in the
 * same write, so the accounts those repayments moved change with it.
 *
 * One replica transaction and one outbox entry: the opening row and its
 * repayments are soft-deleted together or not at all (the transaction rolls
 * back on any throw), the way a transaction's own delete is soft (`deleted_at`,
 * version bumped) — the balance fold, every account balance and every list
 * already ignore a deleted row. A repayment of a debt that predates the ledger
 * was never spending or income, so removing it changes no period figure; it
 * does change the account it moved, which is why the screen lists the
 * repayments and their accounts before it asks.
 *
 * Refused when the row is already gone (a replay is "twice is once" by the
 * outbox's own id; a second, different delete of the same row is a stale
 * screen).
 */

import type { Id } from "@waltning/core/id";
import * as money from "@waltning/core/money";
import { deleteOpeningDebtInput } from "@waltning/core/registry/inputs";
import { and, eq, inArray, isNull, sql } from "drizzle-orm";
import { defineLocalExecutor, LocalRefusal } from "../executor.ts";
import { type ReplicaTx, ledgerSchema as schema } from "../schema-map.ts";
import { readOpeningRepayments } from "./read-opening-debts.ts";

const { openingDebts, transactions } = schema;

export type DeleteOpeningDebtResult = {
  id: Id<"openingDebts">;
  /** The repayments deleted with it. */
  deletedRepayments: number;
  /** What they discharged, in the debt's own currency. */
  repaid: money.Money;
};

export const deleteOpeningDebtExecutor = defineLocalExecutor<
  typeof deleteOpeningDebtInput,
  DeleteOpeningDebtResult,
  ReplicaTx
>({
  operation: "delete_opening_debt",
  opVersion: 1,
  input: deleteOpeningDebtInput,
  /** Mints nothing: it names a row that already exists. */
  mints: () => [],
  apply: (input, tx) => {
    const [debt] = tx
      .select({ id: openingDebts.id, deletedAt: openingDebts.deletedAt })
      .from(openingDebts)
      .where(eq(openingDebts.id, input.id))
      .all();
    if (!debt) {
      throw new LocalRefusal(`delete_opening_debt: no existing debt ${input.id}`, {
        dependency: true,
      });
    }
    if (debt.deletedAt !== null) {
      throw new LocalRefusal(`delete_opening_debt: ${input.id} is already deleted`);
    }

    const repayments = readOpeningRepayments(tx, input.id);
    const now = new Date();
    for (const repayment of repayments) {
      tx.update(transactions)
        .set({ deletedAt: now, version: sql`${transactions.version} + 1`, updatedAt: now })
        .where(and(eq(transactions.id, repayment.id), isNull(transactions.deletedAt)))
        .run();
    }
    // A repayment deleted here may be one half of a split payment: the other
    // half survives as an ordinary repayment, and without a partner a pair id
    // would only make it uneditable for ever (§6.6), so it is cleared.
    const pairIds = repayments.flatMap((repayment) => {
      const row = tx
        .select({ pair: transactions.paymentPairId })
        .from(transactions)
        .where(eq(transactions.id, repayment.id))
        .get();
      return row?.pair == null ? [] : [row.pair];
    });
    if (pairIds.length > 0) {
      tx.update(transactions)
        .set({ paymentPairId: null })
        .where(and(inArray(transactions.paymentPairId, pairIds), isNull(transactions.deletedAt)))
        .run();
    }
    tx.update(openingDebts)
      .set({ deletedAt: now, updatedAt: now })
      .where(eq(openingDebts.id, input.id))
      .run();

    return {
      id: input.id,
      deletedRepayments: repayments.length,
      repaid: repayments.reduce((sum, row) => money.add(sum, row.amount), money.ZERO),
    };
  },
});
