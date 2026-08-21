import type { AnyPgColumn } from "drizzle-orm/pg-core";
import { categories } from "./categories.pg.ts";
import { pgKit as k } from "./kit.ts";
import { transactions } from "./transactions.pg.ts";

/**
 * Split lines, and the one shared table whose foreign keys cannot all be
 * resolved from inside this package.
 *
 * `transaction_id` points at `transactions`, which has not moved here yet.
 * `receipt_id` points at `receipts`, which is **server-only and never will**:
 * a receipt is an object in MinIO with a row describing it, and the phone holds
 * neither. `packages/schema` cannot import `packages/db` to reach either —
 * that is the direction the whole seam exists to forbid.
 *
 * So the targets are passed in. A foreign key is a **constraint, not a type**,
 * so the row type is identical whether one is supplied or not — which is what
 * lets SQLite have no `receipts` table at all and still satisfy the parity
 * assertion.
 *
 * The sum invariant — lines add up to their parent's total — is a deferred
 * constraint trigger and stays in `packages/db` with the rest of §14.7's
 * Postgres-only half.
 */
export type TransactionLineRefs = {
  transactionId: () => AnyPgColumn;
  /** Absent on any engine without a `receipts` table. */
  receiptId?: () => AnyPgColumn;
};

export const transactionLinesColumns = (refs: TransactionLineRefs) => ({
  id: k.id<"transactionLines">("id"),
  transactionId: k
    .uuid("transaction_id")
    .notNull()
    .references(refs.transactionId, { onDelete: "cascade" }),
  receiptId: refs.receiptId
    ? k.uuid<"receipts">("receipt_id").references(refs.receiptId, { onDelete: "set null" })
    : k.uuid<"receipts">("receipt_id"),
  description: k.text("description").notNull(),
  amount: k.money("amount").notNull(),
  quantity: k.qty("quantity"),
  categoryId: k.uuid<"categories">("category_id").references(() => categories.id),
  sort: k.integer("sort").notNull().default(0),
});

/**
 * A bare table for the parity assertion.
 *
 * It supplies **no** `receipts` reference, which is the honest shape: the
 * comparison is of row types, and a foreign key is not one.
 */
export const transactionLines = k.table(
  "transaction_lines",
  transactionLinesColumns({ transactionId: () => transactions.id }),
);
