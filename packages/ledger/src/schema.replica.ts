/**
 * The replica's schema, as one module — because drizzle-kit generates one
 * database per config and this is the list for that database.
 *
 * The thirteen shared tables come from `@waltning/schema/sqlite`, the same
 * definitions `packages/db` builds its Postgres tables from, so a column cannot
 * exist on one engine and not the other without failing a compile (§14.7).
 * `local_meta` is the replica's own, and has no counterpart to keep honest.
 *
 * **It is a separate module from `schema.outbox.ts` because the two files have
 * opposite rules**, not because the list got long. `architecture/08` gives the
 * replica *"drop and refetch"* and the outbox *"never drop"*; they are two
 * SQLite files with two `user_version` counters and two migration chains, so
 * they need two generated schemas. A single entrypoint would put `outbox` in
 * the replica's DDL and `transactions` in the outbox's — each file carrying
 * twelve tables it must never hold.
 */

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
} from "@waltning/schema/sqlite";
export { localMeta } from "./local-meta.ts";
