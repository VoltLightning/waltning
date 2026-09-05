/**
 * `supersede_transaction`, on the device — an import row replaces a manual
 * entry (S02).
 *
 * `operations.md`: *"Import row replaces a manual entry, reattaching its
 * receipt."* The reattachment is server-side — a receipt lives in MinIO the
 * phone never holds — so this executor's job is the two rows: soft-delete
 * the one being replaced, land the full replacement, in the one transaction
 * `writeLocally` already holds open. **Not an update**: the replacement can
 * change `type` and every other field a patch refuses to touch, because an
 * import row is a different fact about the same payment, not a correction to
 * the manual one.
 */

import {
  type SupersedeTransactionInput,
  supersedeTransactionInput,
} from "@waltning/core/registry/inputs";
import { and, eq, isNull } from "drizzle-orm";
import { defineLocalExecutor, LocalRefusal } from "../executor.ts";
import { ledgerSchema as schema } from "../schema-map.ts";
import type { LocalTx } from "../write.ts";
import {
  assertTransactionScale,
  insertTransaction,
  type LocalTransactionRow,
} from "./create-transaction.executor.ts";

const { transactions } = schema;

type ReplicaTx = LocalTx<unknown, typeof schema>;

export const supersedeTransactionExecutor = defineLocalExecutor<
  typeof supersedeTransactionInput,
  LocalTransactionRow,
  ReplicaTx
>({
  operation: "supersede_transaction",
  opVersion: 1,
  input: supersedeTransactionInput,

  /** The replacement row is what this write brings into existence. */
  mints: (input) => [input.replacement.id],

  apply: (input, tx) => supersede(input, tx),
});

function supersede(input: SupersedeTransactionInput, tx: ReplicaTx): LocalTransactionRow {
  const old = tx.select().from(transactions).where(eq(transactions.id, input.supersedesId)).get();
  if (!old) {
    throw new LocalRefusal(`supersede_transaction: no transaction ${input.supersedesId}`, {
      dependency: true,
    });
  }
  if (old.deletedAt !== null) {
    throw new LocalRefusal(`supersede_transaction: ${input.supersedesId} is already deleted`);
  }
  if (old.version !== input.supersedesVersion) {
    throw new LocalRefusal(
      `supersede_transaction: stale version — read ${input.supersedesVersion}, row is at ${old.version}`,
    );
  }

  /**
   * **The replacement must be a new row.** `insertTransaction`'s upsert is
   * keyed on the primary key alone (§14.6's replay rule for `create_transaction`
   * — "twice is once"), which is right for replaying the *same* entry twice
   * and wrong here: an id that already names another transaction would be
   * silently overwritten with no version check at all, and if that row was
   * soft-deleted, the overwrite brings it back live. Checked against the
   * table directly rather than only against `supersedesId` — the input
   * schema already refuses that one case, but a *different* existing id is
   * not decidable from the input alone.
   */
  const collision = tx
    .select({ id: transactions.id })
    .from(transactions)
    .where(eq(transactions.id, input.replacement.id))
    .get();
  if (collision) {
    throw new LocalRefusal(
      `supersede_transaction: replacement id ${input.replacement.id} already names a row — ` +
        "the replacement must be new",
    );
  }

  const deleted = tx
    .update(transactions)
    .set({ deletedAt: new Date(), version: old.version + 1, updatedAt: new Date() })
    .where(
      and(
        eq(transactions.id, input.supersedesId),
        eq(transactions.version, input.supersedesVersion),
        isNull(transactions.deletedAt),
      ),
    )
    .returning()
    .get();
  if (!deleted) {
    throw new Error("supersede_transaction: the superseded row changed between read and write");
  }

  // `SPEC.md` §7.2 — `input.replacement` is a genuinely new row this
  // executor has no `validate` of its own for, unlike `create_transaction`
  // and `settle_debt` (each checks its own input pre-outbox) — `insertTransaction`
  // no longer carries this check itself (L10), so this is `replacement`'s
  // only scale check.
  assertTransactionScale(input.replacement, tx);

  return insertTransaction(input.replacement, tx);
}
