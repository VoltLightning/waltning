/** The shared tables as Postgres declares them. */
export { accountGroups } from "./account-groups.pg.ts";
export { accounts } from "./accounts.pg.ts";
export { currencies } from "./currencies.pg.ts";
export { fxRates } from "./fx-rates.pg.ts";
export { transactions } from "./transactions.pg.ts";

/**
 * **The enums are deliberately not re-exported here.**
 *
 * `parity.type-test.ts` asserts `keyof typeof pg` is *exactly* the shared table
 * set — which is what stops one dialect quietly gaining a table the other lacks.
 * Adding the enum types to this module broke that assertion immediately, which
 * is the guard doing its job: this file means "the shared tables, as Postgres
 * declares them", and an enum is not a table.
 *
 * They live at `@waltning/schema/enums-pg`.
 */
