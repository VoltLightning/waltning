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

import { resolveBrandPatch } from "@waltning/core/brands/match";
import * as money from "@waltning/core/money";
import {
  transactionShapeIssues,
  type UpdateTransactionInput,
  updateTransactionInput,
} from "@waltning/core/registry/inputs";
import { and, eq, isNull, sql } from "drizzle-orm";
import { assertAmountPositive } from "../amount-sign.ts";
import { defineLocalExecutor, LocalRefusal } from "../executor.ts";
import { ledgerSchema as schema } from "../schema-map.ts";
import type { LocalTx } from "../write.ts";
import {
  assertCategoryNotArchived,
  type LocalTransactionRow,
} from "./create-transaction.executor.ts";

const { transactionLines, transactions } = schema;

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

  /**
   * **The sign, before the outbox commits.**
   *
   * `set_transaction_lines` is not the only operation that can move
   * `amount_original` — this one patches it directly, and carried no
   * positivity rule at all: `transactionPatch`'s `superRefine` guards
   * `toAmount` and `fee` and not the amount itself, because the patch never
   * sees the row's `type` and so cannot know whether a sign is legal. The
   * executor does. See `assertAmountPositive` for what a negative amount does
   * to every figure that reads it.
   *
   * Here rather than in `patchTransaction` alone, and it is the difference
   * between two failures: the replica's `transactions_amount_positive_*`
   * trigger raises a bare `SqliteError`, which is not a `LocalRefusal`, so the
   * replica rolls back and the **outbox entry stays** — a real
   * `update_transaction` that Postgres will reject for as long as the device
   * lives (`architecture/14` §14.6). This hook runs before that entry is
   * written, and refuses with a message naming the value.
   *
   * The lines-sum check stays in `apply` where it has always been: a server
   * could resolve that one differently, and this one it cannot.
   */
  validate: (input, tx) => {
    if (input.patch.amountOriginal === undefined) return;
    const current = tx
      .select({ type: transactions.type, deletedAt: transactions.deletedAt })
      .from(transactions)
      .where(eq(transactions.id, input.id))
      .get();
    /**
     * **A row this device does not hold is skipped, not refused — and the two
     * rounds either side of this line are both wrong on their own.**
     *
     * Refusing here was the fix for a ghost id queueing an entry. It caused
     * data loss. An `adjustment` may legitimately carry a negative
     * `amount_original` (`transactions_amount_positive` is `> 0 OR type =
     * 'adjustment'`), and the exemption is a property of a row this hook may
     * not have: an adjustment captured offline in a currency with no known
     * rate defers, so the outbox holds the create and the replica holds no row
     * at all. Editing that adjustment to `-25.00` — the legal value — hit a
     * refusal that `validate` classes `dependency: false`, so `recover.ts`
     * marked the entry `refused`, `outstanding` skips it forever and the drain
     * only reads `pending`. The edit vanished, with no error a person sees.
     *
     * "Neither operation can set a `type`" was the argument for refusing, and
     * it is a non-sequitur: it says this write cannot *make* the row an
     * adjustment, not that the row is not one already.
     *
     * So the rule is judged where the row is. The queued entry that motivated
     * the refusal is not the stuck kind — the replica wrote nothing, so
     * nothing diverges, and the server adjudicates a write against a row only
     * it holds. That is what the outbox is for. `apply` still refuses, with
     * `dependency: true` on the "no such row" path, which is the class
     * `recover.ts` defers rather than drops.
     */
    if (current === undefined || current.deletedAt !== null) return;
    assertAmountPositive(
      "update_transaction: amount_original",
      input.patch.amountOriginal,
      current.type,
    );
  },

  apply: (input, tx) => patchTransaction(input, tx),
});

function patchTransaction(input: UpdateTransactionInput, tx: ReplicaTx): LocalTransactionRow {
  const current = tx.select().from(transactions).where(eq(transactions.id, input.id)).get();
  if (!current) {
    throw new LocalRefusal(`update_transaction: no transaction ${input.id}`, {
      dependency: true,
    });
  }
  if (current.deletedAt !== null) {
    throw new LocalRefusal(`update_transaction: ${input.id} is deleted`);
  }
  if (current.version !== input.version) {
    throw new LocalRefusal(
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
    throw new LocalRefusal(
      `update_transaction: patch would violate the transaction shape — ${shapeIssues
        .map((issue) => `${issue.field}: ${issue.message}`)
        .join("; ")}`,
    );
  }
  // H1a — the same guarantee `create_transaction`'s own `insertTransaction`
  // carries, checked whenever this patch actually touches `categoryId`; an
  // untouched category is not this write's to re-litigate.
  if ("categoryId" in input.patch) {
    assertCategoryNotArchived(tx, merged.categoryId, "update_transaction: category_id");
  }

  /**
   * **A patched amount must still be the sum of its own lines.**
   *
   * §10.3: *"the parent transaction holds the total and every balance reads
   * it, so a mis-summed split is a balance that disagrees with itself."*
   * `set_transaction_lines` has always checked that from the lines' side.
   * Nothing checked it from this side, and `amountOriginal` is patchable — so
   * a split of 10 + 8 could have its parent moved to 50, and every figure read
   * *through* the lines (§6's spend by category) then disagreed with every
   * figure read from the parent (§5's `periodSpend`). S04 renders both, one
   * above the other.
   *
   * Postgres refuses this from both directions already
   * (`transactions_lines_sum_matches`, `AFTER UPDATE OF amount_original`), so
   * the write was one the server would reject when the outbox drained — the
   * device holding a row that cannot sync, which is what `architecture/14`
   * §14.6 exists to prevent. `REPLICA_BACKFILLS["0010_schema"].objects` carries
   * the same trigger on the replica (`migrate.ts`'s `LINE_SUM_TRIGGERS`), so
   * this holds when the code is wrong.
   */
  if (input.patch.amountOriginal !== undefined) {
    assertAmountPositive(
      "update_transaction: amount_original",
      input.patch.amountOriginal,
      current.type,
    );
  }

  if ("amountOriginal" in input.patch) {
    const lines = tx
      .select({ amount: transactionLines.amount })
      .from(transactionLines)
      .where(eq(transactionLines.transactionId, input.id))
      .all();
    if (lines.length > 0) {
      const total = money.sum(lines.map((line) => line.amount));
      const next = input.patch.amountOriginal ?? current.amountOriginal;
      if (!money.eq(total, next)) {
        throw new LocalRefusal(
          `update_transaction: lines sum to ${total}, the patched amount is ${next}`,
        );
      }
    }
  }

  /**
   * `SPEC.md` §14.4b. `resolveBrandPatch` is the single place this decision is
   * made — see its own doc for the four cases (explicit assign, explicit clear
   * to a sticky `"none"`, re-match, or leave alone). It is called only when
   * the patch actually asserts a `brandKey` or *changes* the payee; an
   * `undefined` return means neither column is written.
   *
   * **`!== undefined`, not `"brandKey" in`.** A caller that spreads an
   * optional field builds `{ brandKey: undefined }`, and `in` reports that as
   * a touch — so an edit to some unrelated field would re-resolve a column
   * the writer never named. §14.4b's clear is `brandKey: null`, explicitly;
   * `undefined` is "this patch has no opinion", the same reading every other
   * optional field in the patch gets.
   *
   * **The payee gate compares values, not presence.** §14.4b: *"re-runs the
   * match when `payee` changes"*. A patch that re-sends the payee it already
   * read — what a form does when it submits every field — must leave a `NULL`
   * source alone rather than resolving it afresh, or "never matched" would
   * quietly become "matched" on an edit to some unrelated field.
   */
  const assertedBrandKey = input.patch.brandKey;
  const brandKeyTouched = assertedBrandKey !== undefined;
  const payeeChanged = input.patch.payee !== undefined && input.patch.payee !== current.payee;
  const brandFields =
    brandKeyTouched || payeeChanged
      ? (resolveBrandPatch(
          { brandKey: current.brandKey, brandSource: current.brandSource },
          input.patch.payee ?? current.payee,
          assertedBrandKey,
        ) ?? {})
      : {};

  const updated = tx
    .update(transactions)
    .set({
      ...input.patch,
      ...brandFields,
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
