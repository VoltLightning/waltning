/**
 * The phone's schema: the thirteen shared tables, plus the outbox.
 *
 * The tables come from `@waltning/schema/sqlite` — the same definitions
 * `packages/db` builds its Postgres tables from, so a column cannot exist on
 * one engine and not the other without failing a compile (§14.7).
 *
 * The outbox is the one addition, and it is local by nature rather than by
 * omission: it holds intent that no server has been told about, so there is
 * nothing on the server for it to correspond to.
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
export { OUTBOX_STATE, type OutboxState, outbox } from "./outbox.ts";
