/**
 * The shared column factories, for `packages/db` to build its tables from.
 *
 * Separate from `pg.ts` because that module is asserted to export *exactly* the
 * shared table set — `keyof typeof pg` is compared against `SharedTable`, which
 * is what stops one dialect gaining a table the other lacks. A column factory
 * is not a table, and putting one there broke the assertion the moment it was
 * tried.
 */

export { accountGroupsColumns } from "./account-groups.pg.ts";
export { accountsColumns } from "./accounts.pg.ts";
export { categoriesColumns } from "./categories.pg.ts";
export { counterpartiesColumns } from "./counterparties.pg.ts";
export { currenciesColumns } from "./currencies.pg.ts";
export { dashboardLayoutsColumns } from "./dashboard-layouts.pg.ts";
export { dashboardWidgetsColumns, type WidgetConfig } from "./dashboard-widgets.pg.ts";
export { fxRatesColumns } from "./fx-rates.pg.ts";
export { recurringTransactionsColumns } from "./recurring-transactions.pg.ts";
export { tagsColumns } from "./tags.pg.ts";
export {
  type TransactionLineRefs,
  transactionLinesColumns,
} from "./transaction-lines.pg.ts";
export { transactionTagsColumns } from "./transaction-tags.pg.ts";
