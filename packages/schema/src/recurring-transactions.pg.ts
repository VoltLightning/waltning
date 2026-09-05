import { accounts } from "./accounts.pg.ts";
import { categories } from "./categories.pg.ts";
import { counterparties } from "./counterparties.pg.ts";
import { currencies } from "./currencies.pg.ts";
import { brandSource, txnType } from "./enums.pg.ts";
import { pgKit as k } from "./kit.ts";

/**
 * A rule, not an occurrence. §14.4: materialisation is manual, and a
 * hand-entered row that matches is offered as a **Link** rather than posted a
 * second time.
 */
export const recurringTransactionsColumns = () => ({
  id: k.id<"recurringTransactions">("id"),
  type: txnType("type").notNull(),
  accountId: k
    .uuid("account_id")
    .notNull()
    .references(() => accounts.id),
  toAccountId: k.uuid<"accounts">("to_account_id").references(() => accounts.id),
  categoryId: k.uuid<"categories">("category_id").references(() => categories.id),
  counterpartyId: k.uuid<"counterparties">("counterparty_id").references(() => counterparties.id),
  amountOriginal: k.money("amount_original").notNull(),
  currency: k
    .currency("currency")
    .notNull()
    .references(() => currencies.code),
  payee: k.text("payee").notNull().default(""),
  note: k.text("note").notNull().default(""),
  /**
   * `SPEC.md` §14.4b — the same pair `transactions.pg.ts` carries, so a
   * subscription's occurrences can inherit a recognised mark rather than
   * each posted row re-matching its own payee. No executor writes these yet
   * (no `create_recurring`/`update_recurring` operation exists this arc);
   * the shape guarantee (`recurring_transactions_brand_shape`,
   * `packages/db/src/schema.ts`) is ready for the write path that does.
   */
  brandKey: k.text("brand_key"),
  brandSource: brandSource("brand_source"),
  rrule: k.text("rrule").notNull(),
  nextDate: k.date("next_date"),
  endDate: k.date("end_date"),
  enabled: k.boolean("enabled").notNull().default(true),
  externalId: k.text("external_id"),
  createdAt: k.stamp("created_at"),
  updatedAt: k.stamp("updated_at"),
  version: k.version("version").notNull().default(1),
});

export const recurringTransactions = k.table(
  "recurring_transactions",
  recurringTransactionsColumns(),
);
