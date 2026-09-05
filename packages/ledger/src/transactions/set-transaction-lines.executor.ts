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
 */

import * as money from "@waltning/core/money";
import {
  type SetTransactionLinesInput,
  setTransactionLinesInput,
} from "@waltning/core/registry/inputs";
import { and, eq, isNull } from "drizzle-orm";
import { defineLocalExecutor, LocalRefusal } from "../executor.ts";
import { assertMoneyScale } from "../scale.ts";
import { ledgerSchema as schema } from "../schema-map.ts";
import type { LocalTx } from "../write.ts";
import type { LocalTransactionRow } from "./create-transaction.executor.ts";

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
  // were; only the scale refusal moves.
  validate: (input, tx) => {
    const current = tx
      .select({ currency: transactions.currency, deletedAt: transactions.deletedAt })
      .from(transactions)
      .where(eq(transactions.id, input.transactionId))
      .get();
    if (!current || current.deletedAt !== null) return;
    for (const line of input.lines) {
      assertMoneyScale(
        tx,
        line.amount,
        current.currency,
        `set_transaction_lines: transaction_lines[${line.id}].amount`,
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

  const total = money.sum(input.lines.map((line) => line.amount));
  if (input.lines.length > 0 && !money.eq(total, current.amountOriginal)) {
    throw new LocalRefusal(
      `set_transaction_lines: lines sum to ${total}, the transaction is ${current.amountOriginal}`,
    );
  }

  // `SPEC.md` §7.2, the local mirror of `assert_transaction_line_amount_scale`
  // (`0012_transaction_scale_and_category_kind.sql`): a split belongs to the
  // payment, not the photograph, so each line's own scale is checked against
  // its *parent* transaction's currency — the sum check above proves the
  // total is exact, never that any one line individually is.
  for (const line of input.lines) {
    assertMoneyScale(
      tx,
      line.amount,
      current.currency,
      `set_transaction_lines: transaction_lines[${line.id}].amount`,
    );
  }

  tx.delete(transactionLines).where(eq(transactionLines.transactionId, input.transactionId)).run();

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
