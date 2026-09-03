/**
 * `update_transaction`, on the device — field-level, `operations.md`.
 *
 * **Compare-and-swap on `version`, then patch.** `architecture/14` §14.2: the
 * write carries the version it read; if the row's version differs, the row
 * moved under the writer and the write is refused rather than applied on top.
 * The phone does not do the per-field compare the server does — it has no
 * second device to have raced — but it keeps the version discipline so the
 * outbox entry carries the right token when it drains.
 */

import {
  transactionShapeIssues,
  type UpdateTransactionInput,
  updateTransactionInput,
} from "@waltning/core/registry/inputs";
import { and, eq, isNull, sql } from "drizzle-orm";
import { defineLocalExecutor } from "../executor.ts";
import { ledgerSchema as schema } from "../schema-map.ts";
import type { LocalTx } from "../write.ts";
import type { LocalTransactionRow } from "./create-transaction.executor.ts";

const { transactions } = schema;

/** See `accounts/create-account.executor.ts` for why `TRun` is `unknown` here. */
type ReplicaTx = LocalTx<unknown, typeof schema>;

export const updateTransactionExecutor = defineLocalExecutor<
  typeof updateTransactionInput,
  LocalTransactionRow,
  ReplicaTx
>({
  /** Byte-for-byte the server operation's name — `recover.ts` looks it up by this. */
  operation: "update_transaction",
  opVersion: 1,
  input: updateTransactionInput,

  /**
   * Names rows, mints none: `update_transaction` never brings a row into
   * existence, it only edits one that already does.
   */
  mints: () => [],

  apply: (input, tx) => patchTransaction(input, tx),
});

function patchTransaction(input: UpdateTransactionInput, tx: ReplicaTx): LocalTransactionRow {
  const current = tx.select().from(transactions).where(eq(transactions.id, input.id)).get();
  if (!current) {
    throw new Error(`update_transaction: no transaction ${input.id}`);
  }
  if (current.deletedAt !== null) {
    throw new Error(`update_transaction: ${input.id} is deleted`);
  }
  if (current.version !== input.version) {
    throw new Error(
      `update_transaction: stale version — read ${input.version}, row is at ${current.version}`,
    );
  }

  /**
   * **Checked against the row the patch would produce, not against the patch
   * alone.** `type` is never a patchable field — a `type` change is a
   * supersede — so it is always `current.type`; every other shape field falls
   * back to the current row's value when the patch does not touch it.
   * `transactionShapeIssues` is the same function `createTransactionInput`'s
   * `.superRefine` calls, so an expense cannot be patched into a
   * transfer-shaped row (or a transfer into a categorised one) any more than
   * a fresh create could produce one — the two paths cannot drift because
   * there is only one rule to drift from.
   */
  const merged = {
    type: current.type,
    categoryId: "categoryId" in input.patch ? input.patch.categoryId : current.categoryId,
    toAccountId: "toAccountId" in input.patch ? input.patch.toAccountId : current.toAccountId,
    toAmount: "toAmount" in input.patch ? input.patch.toAmount : current.toAmount,
    toCurrency: "toCurrency" in input.patch ? input.patch.toCurrency : current.toCurrency,
  };
  const shapeIssues = transactionShapeIssues(merged);
  if (shapeIssues.length > 0) {
    throw new Error(
      `update_transaction: patch would violate the transaction shape — ${shapeIssues
        .map((issue) => `${issue.field}: ${issue.message}`)
        .join("; ")}`,
    );
  }

  const updated = tx
    .update(transactions)
    .set({
      ...input.patch,
      version: sql`${transactions.version} + 1`,
      updatedAt: new Date(),
    })
    .where(
      and(
        eq(transactions.id, input.id),
        eq(transactions.version, input.version),
        isNull(transactions.deletedAt),
      ),
    )
    .returning()
    .get();

  if (!updated) {
    // Unreachable given the checks above ran inside the same transaction —
    // a throw here rolls the replica half back and leaves the outbox entry
    // standing, which `recover.ts` replays at the next launch.
    throw new Error("update_transaction: the row changed between read and write");
  }
  return updated;
}
