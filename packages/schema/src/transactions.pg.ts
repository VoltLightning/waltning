import { pgKit as k } from "./kit.ts";

export const transactions = k.table("transactions", {
  id: k.text("id").primaryKey(),
  accountId: k.text("account_id").notNull(),
  date: k.text("date").notNull(),
  type: k.text("type").notNull(),
  amountOriginal: k.money("amount_original").notNull(),
  currency: k.text("currency").notNull(),
  fxRate: k.money("fx_rate").notNull(),
  fxRateEstimated: k.boolean("fx_rate_estimated").notNull().default(false),
  toAmount: k.money("to_amount"),
  toCurrency: k.text("to_currency"),
  toFxRate: k.money("to_fx_rate"),
  payee: k.text("payee").notNull().default(""),
  note: k.text("note").notNull().default(""),
  isBusiness: k.boolean("is_business").notNull().default(false),
  isCapital: k.boolean("is_capital").notNull().default(false),
  externalId: k.text("external_id"),
  createdAt: k.timestamp("created_at").notNull(),
  updatedAt: k.timestamp("updated_at").notNull(),
  version: k.version("version").notNull().default(1),
  deletedAt: k.timestamp("deleted_at"),
});
