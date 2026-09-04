/**
 * The shared tables mean the same thing on both engines — asserted at compile
 * time, once, over the whole set.
 *
 * **One assertion, not one per table.** A hand-written pair of assertions per
 * table is itself the drift it is meant to prevent: adding a table and
 * forgetting its assertion leaves a silent hole, and nothing fails. Mapping
 * over the two modules covers every table that exists and fails when one side
 * gains or loses one.
 *
 * **Both directions of the contract.** `$inferSelect` is what a read returns
 * and `$inferInsert` is what a write must supply — and they fail on different
 * drift. A column present on one engine and absent on the other moves both. A
 * `.default()` on one side and not the other moves only `$inferInsert`, because
 * the row type is `string` either way and only the *insert* becomes optional.
 * Verified by breaking each in turn.
 */

// Type-only: this file must not pull either dialect's runtime onto anything's
// import graph, least of all both at once.
import type { Id } from "@waltning/core/id";
import * as money from "@waltning/core/money";
import type { Simplify } from "drizzle-orm";
import type { accountGroups as pgAccountGroups } from "./account-groups.pg.ts";
import type { accountGroups as sqliteAccountGroups } from "./account-groups.sqlite.ts";
import type { accounts as pgAccounts } from "./accounts.pg.ts";
import type { accounts as sqliteAccounts } from "./accounts.sqlite.ts";
import type { categories as pgCategories } from "./categories.pg.ts";
import type { categories as sqliteCategories } from "./categories.sqlite.ts";
import type { counterparties as pgCounterparties } from "./counterparties.pg.ts";
import type { counterparties as sqliteCounterparties } from "./counterparties.sqlite.ts";
import type { counterpartyDistinctPairs as pgCounterpartyDistinctPairs } from "./counterparty-distinct-pairs.pg.ts";
import type { counterpartyDistinctPairs as sqliteCounterpartyDistinctPairs } from "./counterparty-distinct-pairs.sqlite.ts";
import type { counterpartyMerges as pgCounterpartyMerges } from "./counterparty-merges.pg.ts";
import type { counterpartyMerges as sqliteCounterpartyMerges } from "./counterparty-merges.sqlite.ts";
import type { currencies as pgCurrencies } from "./currencies.pg.ts";
import type { currencies as sqliteCurrencies } from "./currencies.sqlite.ts";
import type { dashboardLayouts as pgDashboardLayouts } from "./dashboard-layouts.pg.ts";
import type { dashboardLayouts as sqliteDashboardLayouts } from "./dashboard-layouts.sqlite.ts";
import type { dashboardWidgets as pgDashboardWidgets } from "./dashboard-widgets.pg.ts";
import type { dashboardWidgets as sqliteDashboardWidgets } from "./dashboard-widgets.sqlite.ts";
import type { fxRates as pgFxRates } from "./fx-rates.pg.ts";
import type { fxRates as sqliteFxRates } from "./fx-rates.sqlite.ts";
import type { recurringTransactions as pgRecurringTransactions } from "./recurring-transactions.pg.ts";
import type { recurringTransactions as sqliteRecurringTransactions } from "./recurring-transactions.sqlite.ts";
import type { SharedTable } from "./shared.ts";
import type { tags as pgTags } from "./tags.pg.ts";
import type { tags as sqliteTags } from "./tags.sqlite.ts";
import type { transactionLines as pgTransactionLines } from "./transaction-lines.pg.ts";
import type { transactionLines as sqliteTransactionLines } from "./transaction-lines.sqlite.ts";
import type { transactionTags as pgTransactionTags } from "./transaction-tags.pg.ts";
import type { transactionTags as sqliteTransactionTags } from "./transaction-tags.sqlite.ts";
import type { transactions as pgTransactions } from "./transactions.pg.ts";
import type { transactions as sqliteTransactions } from "./transactions.sqlite.ts";

type Pg = {
  accountGroups: typeof pgAccountGroups;
  accounts: typeof pgAccounts;
  categories: typeof pgCategories;
  counterparties: typeof pgCounterparties;
  counterpartyDistinctPairs: typeof pgCounterpartyDistinctPairs;
  counterpartyMerges: typeof pgCounterpartyMerges;
  currencies: typeof pgCurrencies;
  dashboardLayouts: typeof pgDashboardLayouts;
  dashboardWidgets: typeof pgDashboardWidgets;
  fxRates: typeof pgFxRates;
  recurringTransactions: typeof pgRecurringTransactions;
  tags: typeof pgTags;
  transactionLines: typeof pgTransactionLines;
  transactions: typeof pgTransactions;
  transactionTags: typeof pgTransactionTags;
};

type Sqlite = {
  accountGroups: typeof sqliteAccountGroups;
  accounts: typeof sqliteAccounts;
  categories: typeof sqliteCategories;
  counterparties: typeof sqliteCounterparties;
  counterpartyDistinctPairs: typeof sqliteCounterpartyDistinctPairs;
  counterpartyMerges: typeof sqliteCounterpartyMerges;
  currencies: typeof sqliteCurrencies;
  dashboardLayouts: typeof sqliteDashboardLayouts;
  dashboardWidgets: typeof sqliteDashboardWidgets;
  fxRates: typeof sqliteFxRates;
  recurringTransactions: typeof sqliteRecurringTransactions;
  tags: typeof sqliteTags;
  transactionLines: typeof sqliteTransactionLines;
  transactions: typeof sqliteTransactions;
  transactionTags: typeof sqliteTransactionTags;
};

/**
 * Invariant under assignability in both directions, so `{a: string}` and
 * `{a: string, b?: number}` are not "equal" and optionality is not silently
 * tolerated. A plain `extends` pair would accept exactly the widening this is
 * here to catch.
 */
type Exact<A, B> =
  (<T>() => T extends A ? 1 : 2) extends <T>() => T extends B ? 1 : 2 ? true : false;

/**
 * `$inferSelect`/`$inferInsert`, normalised with drizzle's own `Simplify`
 * before comparison — not cosmetic. pg-core and sqlite-core are separate
 * modules building their inferred types through separate generic machinery
 * (this file's own header), and for `counterpartyDistinctPairs` — the one
 * table with a composite `primaryKey()` — that machinery produces two type
 * *expressions* `Exact`'s identity trick tells apart even though every
 * property, every required key, and mutual assignability in both directions
 * are all identical (checked by hand while narrowing this down: `Exact`
 * without `Simplify` says `false`, yet `CdpPg extends CdpSqlite` and the
 * reverse both hold, every single column matches, and so does the required-
 * key set). `Simplify` forces both sides through the same "flatten a mapped
 * type into a plain object type" step, so two extensionally equal types
 * compare equal regardless of which module's conditional types produced
 * them — the fix belongs here, once, rather than as a table-shaped
 * exception lower down.
 */
type Selects<S> = { [K in keyof S]: S[K] extends { $inferSelect: infer R } ? Simplify<R> : never };
type Inserts<S> = { [K in keyof S]: S[K] extends { $inferInsert: infer R } ? Simplify<R> : never };

/**
 * `Exact`, applied table by table rather than to the two fifteen-table
 * objects at once — still one assertion per direction, not one per table
 * (the file's own opening rule): the per-table results are folded into a
 * single boolean by `AllTrue`, so a hand-written per-table pair still cannot
 * exist here to forget, and adding or losing a table changes which keys
 * `AllExact` iterates without anyone updating this file.
 *
 * **Also not cosmetic.** Even with `Simplify` on every leaf, comparing the
 * two fifteen-table objects as one `Exact<Inserts<Pg>, Inserts<Sqlite>>`
 * still reports drift that is not there — the aggregate mapped type over
 * all fifteen tables inherits the same same-expression sensitivity `Simplify`
 * fixes at the leaf, one level up. Checking one table's `$inferInsert` at a
 * time, the way `Simplify` was verified to fix it, is what stays inside the
 * region where `Exact` reports real drift and nothing else.
 */
type AllExact<A, B> = { [K in keyof A & keyof B]: Exact<A[K], B[K]> };
type AllTrue<T> = keyof T extends never ? never : T[keyof T] extends true ? true : false;

export const readsMatch: AllTrue<AllExact<Selects<Pg>, Selects<Sqlite>>> = true;
export const writesMatch: AllTrue<AllExact<Inserts<Pg>, Inserts<Sqlite>>> = true;
export const pgTransactionAccountIsAccountId: Exact<
  Selects<Pg>["transactions"]["accountId"],
  Id<"accounts">
> = true;
export const sqliteTransactionAccountIsAccountId: Exact<
  Selects<Sqlite>["transactions"]["accountId"],
  Id<"accounts">
> = true;

/**
 * The vacuity guard. `Selects<{}>` is `{}`, and `Exact<{}, {}>` is `true` — so
 * if both modules exported nothing, or the `infer` arm silently produced
 * `never` for every table, the two assertions above would pass over nothing.
 * Naming a real column of a real table is what makes them mean something.
 */
/**
 * Both modules declare exactly the shared set — no more, no less. Without this
 * the two assertions above are satisfied by two modules that agree on the
 * tables they happen to share while each quietly omitting a different one.
 */
export const pgCoversTheSet: Exact<keyof Pg, SharedTable> = true;
export const sqliteCoversTheSet: Exact<keyof Sqlite, SharedTable> = true;

export const notVacuous: [
  Selects<Pg>["transactions"]["amountOriginal"],
  Selects<Sqlite>["transactions"]["amountOriginal"],
  Selects<Pg>["currencies"]["isPivot"],
] = [money.toMoney("12.34"), money.toMoney("12.34"), true];
