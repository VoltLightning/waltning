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
export { currenciesColumns } from "./currencies.pg.ts";
export { fxRatesColumns } from "./fx-rates.pg.ts";
