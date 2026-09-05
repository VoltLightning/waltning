import { sql } from "drizzle-orm";
import { check } from "drizzle-orm/sqlite-core";
import { accounts } from "./accounts.sqlite.ts";
import { categories } from "./categories.sqlite.ts";
import { counterparties } from "./counterparties.sqlite.ts";
import { currencies } from "./currencies.sqlite.ts";
import { BRAND_SOURCE, TXN_TYPE } from "./enums.ts";
import { sqliteKit as k } from "./kit.ts";

/**
 * A rule, not an occurrence. §14.4: materialisation is manual, and a
 * hand-entered row that matches is offered as a **Link** rather than posted a
 * second time.
 */
export const recurringTransactionsColumns = () => ({
  id: k.id<"recurringTransactions">("id"),
  type: k.text("type", { enum: TXN_TYPE }).notNull(),
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
  /** `SPEC.md` §14.4b — see `recurring-transactions.pg.ts`'s identical field. */
  brandKey: k.text("brand_key"),
  brandSource: k.text("brand_source", { enum: BRAND_SOURCE }),
  rrule: k.text("rrule").notNull(),
  nextDate: k.date("next_date"),
  endDate: k.date("end_date"),
  enabled: k.boolean("enabled").notNull().default(true),
  externalId: k.text("external_id"),
  createdAt: k.stamp("created_at"),
  updatedAt: k.stamp("updated_at"),
  version: k.version("version").notNull().default(1),
});

/**
 * Round 1's M1 — `recurring_transactions_brand_shape` was missing here
 * entirely: SQLite had the two columns (a bare `ALTER TABLE … ADD`,
 * `0010_schema.sql`) with nothing enforcing their pairing, while Postgres
 * refused it from the start (`packages/db/src/schema.ts`). §14.4b names no
 * engine exception, and `architecture/14` §14.6 requires the phone to refuse
 * at capture time what the server would refuse — even though no executor
 * writes this table yet this arc, the guarantee is stated where the columns
 * are, not deferred until a write path exists to expose the gap. Same
 * formula as `transactions_brand_shape` (`transactions.sqlite.ts`) — see its
 * own comment for the three-value `brand_source` shape.
 */
export const recurringTransactions = k.table(
  "recurring_transactions",
  recurringTransactionsColumns(),
  (t) => [
    check(
      "recurring_transactions_brand_shape",
      sql`(${t.brandKey} IS NULL AND (${t.brandSource} IS NULL OR ${t.brandSource} = 'none')) OR (${t.brandKey} IS NOT NULL AND ${t.brandSource} IS NOT NULL AND ${t.brandSource} IN ('auto', 'manual'))`,
    ),
  ],
);
