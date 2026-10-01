import { sql } from "drizzle-orm";
import { check, uniqueIndex } from "drizzle-orm/sqlite-core";
import { counterparties } from "./counterparties.sqlite.ts";
import { currencies } from "./currencies.sqlite.ts";
import { OPENING_DEBT_DIRECTION } from "./enums.ts";
import { sqliteKit as k } from "./kit.ts";

/**
 * A debt that predates the ledger (§6.6) — what a person already owed you, or
 * you them, on the day the books begin. It is to a counterparty what
 * `accounts.opening_balance` is to an account: a starting position, entered
 * once, that is neither income nor spending.
 *
 * **Not a transaction, and that is the design.** A transaction carries an
 * account, and an account's balance and every period figure are made of
 * transactions; a row here moves none of them. It reaches exactly one figure,
 * the counterparty's balance (`counterparty_balances`, §7), where it folds in
 * as a lend (`theyOwe`) or a borrow (`youOwe`) and is settled by `settle_debt`
 * like any other debt.
 *
 * One row per person per currency: recording it again replaces it, the way
 * editing an opening balance does.
 *
 * **Not bare, the same exception `counterparty-merges.sqlite.ts` makes.** The
 * phone runs `record_opening_debt` with no server beneath it to catch a caller
 * that skipped the executor's own checks, so the shape is declared here
 * directly. A CHECK is affordable on this table where it is not on
 * `transactions`: the table is new, so there is no existing row for a rebuild
 * to copy through it. SQLite stores money as TEXT, hence the `cast … as real`
 * the `fx_rates` bounds use too.
 */
export const openingDebtsColumns = () => ({
  id: k.id<"openingDebts">("id"),
  counterpartyId: k
    .uuid<"counterparties">("counterparty_id")
    .notNull()
    .references(() => counterparties.id),
  currency: k
    .currency("currency")
    .notNull()
    .references(() => currencies.code),
  direction: k.text("direction", { enum: OPENING_DEBT_DIRECTION }).notNull(),
  amount: k.money("amount").notNull(),
  date: k.date("date").notNull(),
  /** Deleting an opening debt (and its repayments) is a soft delete, like a transaction's. */
  deletedAt: k.timestamp("deleted_at"),
  createdAt: k.stamp("created_at"),
  updatedAt: k.stamp("updated_at"),
});

export const openingDebts = k.table("opening_debts", openingDebtsColumns(), (t) => [
  uniqueIndex("opening_debts_counterparty_currency_uq")
    .on(t.counterpartyId, t.currency)
    .where(sql`${t.deletedAt} is null`),
  check("opening_debts_amount_positive", sql`cast(${t.amount} as real) > 0`),
  // The text test the replica's own `*_amount_ceiling_*` triggers make:
  // amounts are normalised decimal strings, so "a billion or more" is "more
  // than nine digits before the point" — exact, where `cast … as real` rounds
  // 999999999.99999999 up to 1e9 and refuses a figure in bounds.
  check(
    "opening_debts_amount_ceiling",
    sql`length(substr(${t.amount}, 1, instr(${t.amount} || '.', '.') - 1)) <= 9`,
  ),
  check("opening_debts_direction_known", sql`${t.direction} in ('theyOwe', 'youOwe')`),
]);
