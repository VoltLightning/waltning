import { currencies } from "./currencies.pg.ts";
import { counterpartyKind } from "./enums.pg.ts";
import { pgKit as k } from "./kit.ts";

/** The unique index on the normalised name stays in `packages/db`. */
export const counterpartiesColumns = () => ({
  id: k.id("id"),
  name: k.text("name").notNull(),
  kind: counterpartyKind("kind").notNull().default("person"),
  settlementCurrency: k.text("settlement_currency").references(() => currencies.code),
  contact: k.text("contact"),
  note: k.text("note").notNull().default(""),
  defaultActivity: k.text("default_activity"),
  archived: k.boolean("archived").notNull().default(false),
  sort: k.integer("sort").notNull().default(0),
  createdAt: k.stamp("created_at"),
  updatedAt: k.stamp("updated_at"),
  version: k.version("version").notNull().default(1),
});

export const counterparties = k.table("counterparties", counterpartiesColumns());
