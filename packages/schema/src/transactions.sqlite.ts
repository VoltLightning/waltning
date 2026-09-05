import { sql } from "drizzle-orm";
import { check, index } from "drizzle-orm/sqlite-core";
import { accounts } from "./accounts.sqlite.ts";
import { categories } from "./categories.sqlite.ts";
import { counterparties } from "./counterparties.sqlite.ts";
import { currencies } from "./currencies.sqlite.ts";
import { BRAND_SOURCE, COUNTERPARTY_ROLE, TXN_SOURCE, TXN_TYPE } from "./enums.ts";
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
 * Most indexes, all eight foreign-key behaviours and every other check stay
 * in `packages/db`. **`category_id` and `counterparty_id` are the exceptions
 * (M2, R2 M4)** — S19's merge preview reads `category_id` straight off the
 * replica, on every render the merge sheet is open for, and
 * `readCounterpartyBalances`/`balancesForCounterparty`
 * (`packages/ledger/src/counterparties/read-counterparty-balances.ts`) scan
 * `transactions` by `counterparty_id` on every settlement, every archive
 * gate, and every §7 read — the same predicate Postgres already indexes
 * (`transactions_counterparty_idx`) — and the replica had nothing at all
 * backing either one.
 *
 * **One check does not stay server-only (L), the same exception
 * `counterparty_distinct_pairs` makes for its own ordering check** — the
 * phone is where `settle_debt` writes `debt_amount`/`debt_currency` directly
 * (S14), with no server yet to catch a caller that skipped the pairing, so
 * §14.6's "refuse at capture time" needs it declared here rather than only in
 * `packages/db`.
 *
 * **One-directional, not full symmetry: `debt_amount` requires
 * `debt_currency`, not the other way round.** A `debt_amount` with no stated
 * currency is genuinely ambiguous — nothing says what it is 214.05 *of* —
 * while `debt_currency` alone (redirecting which currency a balance is
 * discharged in, the amount left to default from the leg itself) is a state
 * `counterparty-balance.ts`'s SQL and `read-counterparty-balances.ts`'s
 * `coalesceDebtAmount` both already coalesce field-by-field rather than
 * refuse.
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
  /**
   * `SPEC.md` §14.4b — see `transactions.pg.ts`'s identical field for the
   * full argument. `transactions_brand_shape` (below) is one of the
   * exceptions this file already carries alongside
   * `transactions_debt_amount_requires_currency`: the phone is a writer of
   * this table this arc with no server yet to catch a caller that skipped
   * the pairing, so §14.6 requires it refused at capture time, not only on a
   * server that does not exist yet.
   */
  brandKey: k.text("brand_key"),
  brandSource: k.text("brand_source", { enum: BRAND_SOURCE }),
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
 * Four exceptions to "most indexes and checks stay in `packages/db`":
 * `transactions_category_idx` backs the category reads on the phone,
 * `transactions_counterparty_idx` backs the counterparty-balance reads
 * (R2 M4), `transactions_debt_amount_requires_currency` and
 * `transactions_brand_shape` are each a check that must refuse at capture
 * time rather than only on a server that does not exist yet this arc (L,
 * §14.4b).
 */
export const transactions = k.table("transactions", transactionsColumns(), (t) => [
  index("transactions_category_idx").on(t.categoryId),
  index("transactions_counterparty_idx").on(t.counterpartyId),
  check(
    "transactions_debt_amount_requires_currency",
    sql`${t.debtAmount} IS NULL OR ${t.debtCurrency} IS NOT NULL`,
  ),
  check("transactions_brand_shape", sql`(${t.brandKey} IS NULL) = (${t.brandSource} IS NULL)`),
]);
