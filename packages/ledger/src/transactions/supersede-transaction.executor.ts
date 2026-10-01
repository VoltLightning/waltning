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

import * as money from "@waltning/core/money";
import {
  type SupersedeTransactionInput,
  supersedeTransactionInput,
} from "@waltning/core/registry/inputs";
import { and, eq, isNull } from "drizzle-orm";
import { openingLinkFor } from "../counterparties/opening-link.ts";
import { defineLocalExecutor, LocalRefusal } from "../executor.ts";
import { type ReplicaTx, ledgerSchema as schema } from "../schema-map.ts";
import {
  assertTransactionScale,
  insertTransaction,
  type LocalTransactionRow,
} from "./create-transaction.executor.ts";
import { assertDebtCategoryShape } from "./debt-categories.ts";

const { transactions } = schema;

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

  // §6.6 — one payment written as two rows (a settlement that crossed the end
  // of an existing debt) is replaced as one payment or not at all: replacing a
  // half would leave the other counting the same money.
  if (old.paymentPairId !== null) {
    throw new LocalRefusal(
      "supersede_transaction: this payment was split against an existing debt — replace both",
    );
  }

  // §6.6 — before the original is touched, so the refusal names this operation.
  assertDebtCategoryShape(
    tx,
    input.replacement.categoryId,
    input.replacement,
    "supersede_transaction: replacement.category_id",
  );

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
  // and `settle_debt` (each checks its own input pre-outbox). `insertTransaction`
  // carries the identical call too, the same duplication every scale-checked
  // executor keeps — named here as well so the refusal reads as
  // `supersede_transaction`'s own, not a passthrough from a function two
  // layers away.
  assertTransactionScale(input.replacement, tx);

  const inserted = insertTransaction(input.replacement, tx);

  /**
   * **A linked repayment stays linked when it is replaced (§6.6).** The
   * replacement is built from `createTransactionInput`, which carries no
   * discharge or link, so without this the row would come back as an ordinary
   * debt entry: counted in the period figures and no longer taken with its
   * opening debt. Carried — with the discharge it is a part of — only while the
   * replacement is still a debt-role row with the same person, the case the link
   * describes.
   */
  // **Re-checked against what is open**, not copied: the replacement may be a
  // different figure, and the link only holds while the discharge still fits.
  const stillFits = (() => {
    if (
      old.settlesOpeningDebtId === null ||
      old.debtCurrency === null ||
      old.debtAmount === null ||
      inserted.obligationRole !== "debt" ||
      inserted.obligationCounterpartyId === null ||
      inserted.obligationCounterpartyId !== old.obligationCounterpartyId ||
      (inserted.type !== "income" && inserted.type !== "expense")
    ) {
      return false;
    }
    const link = openingLinkFor(tx, {
      counterpartyId: inserted.obligationCounterpartyId,
      currency: old.debtCurrency,
      type: inserted.type,
    });
    return (
      link !== null &&
      link.id === old.settlesOpeningDebtId &&
      money.cmp(old.debtAmount, link.open) <= 0
    );
  })();
  if (stillFits) {
    const [carried] = tx
      .update(transactions)
      .set({
        settlesOpeningDebtId: old.settlesOpeningDebtId,
        debtCurrency: old.debtCurrency,
        debtAmount: old.debtAmount,
      })
      .where(eq(transactions.id, inserted.id))
      .returning()
      .all();
    if (carried) return carried;
  }
  return inserted;
}
