import { index } from "drizzle-orm/sqlite-core";
import { accounts } from "./accounts.sqlite.ts";
import { categories } from "./categories.sqlite.ts";
import { counterparties } from "./counterparties.sqlite.ts";
import { currencies } from "./currencies.sqlite.ts";
import { COUNTERPARTY_ROLE, TXN_SOURCE, TXN_TYPE } from "./enums.ts";
import { sqliteKit as k } from "./kit.ts";
import { recurringTransactions } from "./recurring-transactions.sqlite.ts";

/**
 * The ledger's central table — and the one place §14.7 names explicitly.
 *
 * **`amount_pivot` and `to_amount_pivot` are not here, and their absence is the
 * whole point of this file.** They were stored generated columns, which SQLite
 * has no equivalent for at all — so under the rule that *Postgres adds power
 * around the shared tables, never inside them*, they move onto a
 * `transactions_valued` view in `packages/db`. The base table is then the same
 * concept on both engines, which is what makes a shared definition possible
 * rather than aspirational.
 *
 * `computations.md`'s formulae are unchanged; only where the multiplication
 * happens moved.
 *
 * **The tax columns are shared, which looks wrong and is not.** The tax
 * *tables* are server-only (§14.7), but `ryczalt_rate`, `ryczalt_activity` and
 * `counterparty_tax_id` are columns on a transaction, and §14.2 names all three
 * in the tax-sensitive set — the fields whose conflicts must always ask a
 * person. A field the phone cannot hold is a field the phone cannot conflict
 * on, and it would be shown a row missing figures it is expected to check.
 *
 * Most indexes, all eight foreign-key behaviours and every check stay in
 * `packages/db`. **`category_id` is the one exception (M2)** — S19's merge
 * preview reads it straight off the replica, on every render the merge
 * sheet is open for, and an unindexed scan there is a phone-side cost this
 * file can remove even while the rest of the index set stays server-only.
 */
export const transactionsColumns = () => ({
  id: k.id<"transactions">("id"),
  date: k.date("date").notNull(),
  type: k.text("type", { enum: TXN_TYPE }).notNull(),
  accountId: k
    .uuid<"accounts">("account_id")
    .notNull()
    .references(() => accounts.id, { onDelete: "restrict" }),
  toAccountId: k
    .uuid<"accounts">("to_account_id")
    .references(() => accounts.id, { onDelete: "restrict" }),
  categoryId: k
    .uuid<"categories">("category_id")
    .references(() => categories.id, { onDelete: "restrict" }),
  counterpartyId: k.uuid<"counterparties">("counterparty_id").references(() => counterparties.id),
  counterpartyRole: k.text("counterparty_role", { enum: COUNTERPARTY_ROLE }),
  debtCurrency: k.currency("debt_currency").references(() => currencies.code),
  debtAmount: k.money("debt_amount"),
  amountOriginal: k.money("amount_original").notNull(),
  currency: k
    .currency("currency")
    .notNull()
    .references(() => currencies.code),
  fxRate: k.pivotPerUnit("fx_rate").notNull(),
  fxRateEstimated: k.boolean("fx_rate_estimated").notNull().default(false),
  toAmount: k.money("to_amount"),
  toCurrency: k.currency("to_currency").references(() => currencies.code),
  toFxRate: k.pivotPerUnit("to_fx_rate"),
  payee: k.text("payee").notNull().default(""),
  note: k.text("note").notNull().default(""),
  isBusiness: k.boolean("is_business").notNull().default(false),
  isCapital: k.boolean("is_capital").notNull().default(false),
  recurringId: k
    .uuid<"recurringTransactions">("recurring_id")
    .references(() => recurringTransactions.id),
  occurrenceDate: k.date("occurrence_date"),
  fee: k.money("fee"),
  counterpartyTaxId: k.text("counterparty_tax_id"),
  documentRef: k.text("document_ref"),
  ksefId: k.text("ksef_id"),
  ryczaltRate: k.taxRate("ryczalt_rate"),
  ryczaltActivity: k.text("ryczalt_activity"),
  taxFxRate: k.pivotPerUnit("tax_fx_rate"),
  taxFxDate: k.date("tax_fx_date"),
  taxFxSource: k.text("tax_fx_source"),
  source: k.text("source", { enum: TXN_SOURCE }).notNull().default("manual"),
  externalId: k.text("external_id"),
  createdAt: k.stamp("created_at"),
  updatedAt: k.stamp("updated_at"),
  version: k.version("version").notNull().default(1),
  deletedAt: k.timestamp("deleted_at"),
});

/**
 * Two indexes, the exceptions to "the nine indexes stay in `packages/db`".
 * `transactions_category_idx` backs the category reads on the phone.
 * **R2 M4** — `readCounterpartyBalances` and `balancesForCounterparty`
 * (`packages/ledger/src/counterparties/read-counterparty-balances.ts`) both
 * scan `transactions` by `counterparty_id` on every settlement, every archive
 * gate, and every §7 read — the same predicate Postgres already indexes
 * (`transactions_counterparty_idx`) — and the replica had nothing at all
 * backing it.
 */
export const transactions = k.table("transactions", transactionsColumns(), (t) => [
  index("transactions_category_idx").on(t.categoryId),
  index("transactions_counterparty_idx").on(t.counterpartyId),
]);
