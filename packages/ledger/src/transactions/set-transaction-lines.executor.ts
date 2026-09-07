/**
 * `set_transaction_lines`, on the device — the optional breakdown (§10.3).
 *
 * **The whole set replaces the old one.** A line-by-line patch would need a
 * merge rule nobody can state — which line an incoming id refers to when the
 * set shrinks or reorders is not decidable from the payload alone. So this
 * executor deletes every existing line for the transaction and inserts the
 * set it was handed, inside the one transaction `writeLocally` already holds
 * open: a caller never observes a transaction with half its old lines and
 * half its new ones.
 *
 * **The sum must equal the transaction's own amount.** §10.3: *"the parent
 * transaction holds the total and every balance reads it, so a mis-summed
 * breakdown can never move a balance."* That is a property of the total, not
 * of any one line, so it is checked here — where both the lines and the
 * transaction's `amount_original` are in hand — rather than in the input
 * schema, which never sees the transaction row.
 *
 * **A line's own category obeys H1a too.** `transaction_lines.category_id` is
 * a second place a retired leaf can be assigned, and the one the parent row
 * hides: the transaction shows a category the reader recognises while a line
 * beneath it points at one no picker offers. `assertCategoryNotArchived`
 * (`create-transaction.executor.ts`, the same function the parent's own
 * `category_id` goes through) runs per line, above the replica's
 * `transaction_lines_category_not_archived_*` triggers and the server's
 * `assert_category_not_archived` on the same table.
 */

import * as money from "@waltning/core/money";
import {
  type SetTransactionLinesInput,
  setTransactionLinesInput,
} from "@waltning/core/registry/inputs";
import { and, eq, isNull } from "drizzle-orm";
import { assertAmountPositive } from "../amount-sign.ts";
import { defineLocalExecutor, LocalRefusal } from "../executor.ts";
import { assertMoneyScale } from "../scale.ts";
import { ledgerSchema as schema } from "../schema-map.ts";
import type { LocalTx } from "../write.ts";
import {
  assertCategoryNotArchived,
  type LocalTransactionRow,
} from "./create-transaction.executor.ts";

const { transactionLines, transactions } = schema;

type ReplicaTx = LocalTx<unknown, typeof schema>;

export const setTransactionLinesExecutor = defineLocalExecutor<
  typeof setTransactionLinesInput,
  LocalTransactionRow,
  ReplicaTx
>({
  operation: "set_transaction_lines",
  opVersion: 1,
  input: setTransactionLinesInput,

  /**
   * Every line id this write brings into existence. The transaction itself
   * is named, not minted — it already exists, which is why this operation can
   * run against it at all.
   */
  mints: (input) => input.lines.map((line) => line.id),

  // H2 — read-only, run before the outbox commits (`LocalExecutor.validate`'s
  // own doc): a line past its parent transaction's own currency scale is
  // refused the same way `replaceLines`' own check already does, never
  // queued as an intent nothing will ever apply. Business refusals that a
  // future server might still resolve differently — a stale version, a
  // lines sum that does not match — stay inside `apply`, where they always
  // were; only the scale refusals move. The restated total is one of them:
  // it arrives on the same operation and is judged against the same currency,
  // so leaving it in `apply` alone would queue an intent no server can ever
  // resolve — the one thing this hook exists to prevent.
  validate: (input, tx) => {
    const current = tx
      .select({
        currency: transactions.currency,
        deletedAt: transactions.deletedAt,
        type: transactions.type,
      })
      .from(transactions)
      .where(eq(transactions.id, input.transactionId))
      .get();
    if (!current || current.deletedAt !== null) return;
    if (input.amountOriginal !== undefined) {
      assertMoneyScale(
        tx,
        input.amountOriginal,
        current.currency,
        "set_transaction_lines: amount_original",
      );
      assertAmountPositive(
        "set_transaction_lines: amount_original",
        input.amountOriginal,
        current.type,
      );
    }
    /**
     * **An empty set carries no total.** `replaceLines`' sum check is gated on
     * `lines.length > 0`, and the lines are deleted before the parent is
     * updated — so `{ lines: [], amountOriginal: "9999.00" }` cleared a split
     * and restated the amount to anything at all, with the sum check skipped
     * and the replica's own trigger already abstaining (its `WHEN` requires
     * lines to exist). This operation names a breakdown; the operation that
     * moves an amount on its own is `update_transaction`.
     */
    if (input.lines.length === 0 && input.amountOriginal !== undefined) {
      throw new LocalRefusal(
        "set_transaction_lines: an empty set removes the breakdown and cannot restate the amount — patch it with update_transaction",
      );
    }

    for (const line of input.lines) {
      assertMoneyScale(
        tx,
        line.amount,
        current.currency,
        `set_transaction_lines: transaction_lines[${line.id}].amount`,
      );
      /**
       * **A line signs no more than its parent does.** The same argument as
       * `assertAmountPositive`, one column over: §12 stores a line as a
       * magnitude, and `-10.00` in a set summing to the right total is a
       * category that reads back with its sign flipped in §6's spend figures.
       * Postgres has no CHECK here — `transaction_lines` carries none — so
       * this is a service check with no constraint under it, and stricter than
       * the server on purpose: a device that refuses what the server would
       * accept queues nothing, which is the safe direction.
       */
      assertAmountPositive(
        `set_transaction_lines: transaction_lines[${line.id}].amount`,
        line.amount,
        current.type,
      );
    }
  },

  apply: (input, tx) => replaceLines(input, tx),
});

function replaceLines(input: SetTransactionLinesInput, tx: ReplicaTx): LocalTransactionRow {
  const current = tx
    .select()
    .from(transactions)
    .where(eq(transactions.id, input.transactionId))
    .get();
  if (!current) {
    throw new LocalRefusal(`set_transaction_lines: no transaction ${input.transactionId}`, {
      dependency: true,
    });
  }
  if (current.deletedAt !== null) {
    throw new LocalRefusal(`set_transaction_lines: ${input.transactionId} is deleted`);
  }
  if (current.version !== input.version) {
    throw new LocalRefusal(
      `set_transaction_lines: stale version — read ${input.version}, row is at ${current.version}`,
    );
  }

  /**
   * **The amount this set is judged against — the patched one where the caller
   * sent it.** Postgres can take the two statements separately because both
   * sum triggers are `DEFERRABLE INITIALLY DEFERRED`: the parent and its lines
   * may disagree inside a transaction and are judged at commit. Each operation
   * here is its own transaction, so without this a split's total could not be
   * changed in either order — 18 split 10 + 8 could not become 20 split
   * 10 + 10, because amount-first is refused by the parent's check and
   * lines-first by this one. Carrying both in one operation is the device's
   * deferral.
   */
  const nextAmount = input.amountOriginal ?? current.amountOriginal;
  if (input.amountOriginal !== undefined) {
    assertMoneyScale(
      tx,
      input.amountOriginal,
      current.currency,
      "set_transaction_lines: amount_original",
    );
    assertAmountPositive(
      "set_transaction_lines: amount_original",
      input.amountOriginal,
      current.type,
    );
  }

  const total = money.sum(input.lines.map((line) => line.amount));
  if (input.lines.length > 0 && !money.eq(total, nextAmount)) {
    throw new LocalRefusal(
      `set_transaction_lines: lines sum to ${total}, the transaction is ${nextAmount}`,
    );
  }

  // `SPEC.md` §7.2, the local mirror of `assert_transaction_line_amount_scale`
  // (`0011_transaction_scale_and_category_kind.sql`): a split belongs to the
  // payment, not the photograph, so each line's own scale is checked against
  // its *parent* transaction's currency — the sum check above proves the
  // total is exact, never that any one line individually is.
  //
  // H1a, on the same pass: a line may no more point at an archived category
  // than its parent may. Every line is checked before any row is written —
  // the whole set replaces the old one, so a refusal on line three must not
  // arrive with lines one and two already deleted.
  for (const line of input.lines) {
    assertMoneyScale(
      tx,
      line.amount,
      current.currency,
      `set_transaction_lines: transaction_lines[${line.id}].amount`,
    );
    assertCategoryNotArchived(
      tx,
      line.categoryId ?? null,
      `set_transaction_lines: transaction_lines[${line.id}].category_id`,
    );
  }

  // The parent first, and only when it moves: the lines are about to be
  // replaced, so the sum trigger on `transactions` sees the *old* set here —
  // which is why an amount change has to arrive with an empty line table under
  // it. Deleting first is what gives it one.
  tx.delete(transactionLines).where(eq(transactionLines.transactionId, input.transactionId)).run();

  if (input.amountOriginal !== undefined) {
    tx.update(transactions)
      .set({ amountOriginal: money.toMoney(input.amountOriginal) })
      .where(eq(transactions.id, input.transactionId))
      .run();
  }

  if (input.lines.length > 0) {
    tx.insert(transactionLines)
      .values(
        input.lines.map((line, index) => ({
          id: line.id,
          transactionId: input.transactionId,
          description: line.description,
          amount: line.amount,
          sort: index,
          ...(line.quantity !== undefined ? { quantity: line.quantity } : {}),
          ...(line.categoryId !== undefined ? { categoryId: line.categoryId } : {}),
        })),
      )
      .run();
  }

  const updated = tx
    .update(transactions)
    .set({ version: current.version + 1, updatedAt: new Date() })
    .where(
      and(
        eq(transactions.id, input.transactionId),
        eq(transactions.version, input.version),
        isNull(transactions.deletedAt),
      ),
    )
    .returning()
    .get();

  if (!updated) {
    throw new Error("set_transaction_lines: the row changed between read and write");
  }
  return updated;
}
