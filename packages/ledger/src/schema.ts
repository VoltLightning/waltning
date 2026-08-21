/**
 * The phone's schema: the thirteen shared tables, the replica's meta store, and
 * the outbox pair.
 *
 * **The barrel over both databases, and only the barrel.** The per-database
 * lists are `schema.replica.ts` and `schema.outbox.ts`, which is what
 * drizzle-kit generates from — a `SELECT` does not care which file a table
 * lives in, and a `CREATE TABLE` cares about nothing else. Keeping the union
 * here means a query module still imports one thing, while neither generated
 * migration can pick up a table from the other database.
 */

export { localMeta } from "./local-meta.ts";
export { OUTBOX_STATE, type OutboxState } from "./outbox.ts";
export { outbox, outboxSeq } from "./schema.outbox.ts";
export {
  accountGroups,
  accounts,
  categories,
  counterparties,
  currencies,
  dashboardLayouts,
  dashboardWidgets,
  fxRates,
  recurringTransactions,
  tags,
  transactionLines,
  transactions,
  transactionTags,
} from "./schema.replica.ts";
