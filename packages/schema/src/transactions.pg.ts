import { accounts } from "./accounts.pg.ts";
import { categories } from "./categories.pg.ts";
import { counterparties } from "./counterparties.pg.ts";
import { currencies } from "./currencies.pg.ts";
import { counterpartyRole, txnSource, txnType } from "./enums.pg.ts";
import { pgKit as k } from "./kit.ts";
import { recurringTransactions } from "./recurring-transactions.pg.ts";

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
 * The nine indexes, eight foreign-key behaviours and every check stay in
 * `packages/db`.
 */
export const transactionsColumns = () => ({
  id: k.id("id"),
  date: k.date("date").notNull(),
  type: txnType("type").notNull(),
  accountId: k
    .uuid("account_id")
    .notNull()
    .references(() => accounts.id, { onDelete: "restrict" }),
  toAccountId: k.uuid("to_account_id").references(() => accounts.id, { onDelete: "restrict" }),
  categoryId: k.uuid("category_id").references(() => categories.id, { onDelete: "restrict" }),
  counterpartyId: k.uuid("counterparty_id").references(() => counterparties.id),
  counterpartyRole: counterpartyRole("counterparty_role"),
  debtCurrency: k.text("debt_currency").references(() => currencies.code),
  debtAmount: k.money("debt_amount"),
  amountOriginal: k.money("amount_original").notNull(),
  currency: k
    .text("currency")
    .notNull()
    .references(() => currencies.code),
  fxRate: k.pivotPerUnit("fx_rate").notNull(),
  fxRateEstimated: k.boolean("fx_rate_estimated").notNull().default(false),
  toAmount: k.money("to_amount"),
  toCurrency: k.text("to_currency").references(() => currencies.code),
  toFxRate: k.pivotPerUnit("to_fx_rate"),
  payee: k.text("payee").notNull().default(""),
  note: k.text("note").notNull().default(""),
  isBusiness: k.boolean("is_business").notNull().default(false),
  isCapital: k.boolean("is_capital").notNull().default(false),
  recurringId: k.uuid("recurring_id").references(() => recurringTransactions.id),
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
  source: txnSource("source").notNull().default("manual"),
  externalId: k.text("external_id"),
  createdAt: k.stamp("created_at"),
  updatedAt: k.stamp("updated_at"),
  version: k.version("version").notNull().default(1),
  deletedAt: k.timestamp("deleted_at"),
});

export const transactions = k.table("transactions", transactionsColumns());
