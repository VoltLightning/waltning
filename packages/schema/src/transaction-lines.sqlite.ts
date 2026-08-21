import type { AnySQLiteColumn } from "drizzle-orm/sqlite-core";
import { categories } from "./categories.sqlite.ts";
import { sqliteKit as k } from "./kit.ts";
import { transactions } from "./transactions.sqlite.ts";

/** See `transaction-lines.pg.ts`. There is no `receipts` table on the phone. */
export type TransactionLineRefs = {
  transactionId: () => AnySQLiteColumn;
  receiptId?: () => AnySQLiteColumn;
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
