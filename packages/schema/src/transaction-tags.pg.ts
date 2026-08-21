import type { AnyPgColumn } from "drizzle-orm/pg-core";
import { pgKit as k } from "./kit.ts";
import { tags } from "./tags.pg.ts";
import { transactions } from "./transactions.pg.ts";

/**
 * The join table. `transaction_id`'s target is passed in for the same reason as
 * `transaction-lines.pg.ts` — `transactions` has not moved here yet.
 *
 * The composite unique that makes `(transaction_id, tag_id)` the identity stays
 * in `packages/db`: it is a constraint, and §14.7 keeps those layered around.
 */
export const transactionTagsColumns = (refs: { transactionId: () => AnyPgColumn }) => ({
  transactionId: k
    .uuid("transaction_id")
    .notNull()
    .references(refs.transactionId, { onDelete: "cascade" }),
  tagId: k
    .uuid("tag_id")
    .notNull()
    .references(() => tags.id, { onDelete: "cascade" }),
});

/** A bare table for the parity assertion. */
export const transactionTags = k.table(
  "transaction_tags",
  transactionTagsColumns({ transactionId: () => transactions.id }),
);
