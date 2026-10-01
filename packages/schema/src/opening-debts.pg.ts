import { counterparties } from "./counterparties.pg.ts";
import { currencies } from "./currencies.pg.ts";
import { OPENING_DEBT_DIRECTION } from "./enums.ts";
import { pgKit as k } from "./kit.ts";

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
 * The shape guarantees — an amount above zero and under the ceiling, a known
 * direction, one row per person and currency — are real constraints on both
 * engines, declared in `packages/db` and on the replica's own table; this is
 * the bare table, for the parity assertion.
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
  createdAt: k.stamp("created_at"),
  updatedAt: k.stamp("updated_at"),
});

export const openingDebts = k.table("opening_debts", openingDebtsColumns());
