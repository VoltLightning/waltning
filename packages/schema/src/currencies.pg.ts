import { pgKit as k } from "./kit.ts";

export const currencies = k.table("currencies", {
  code: k.text("code").primaryKey(),
  name: k.text("name").notNull(),
  symbol: k.text("symbol").notNull().default(""),
  symbolPosition: k.text("symbol_position").notNull().default("P"),
  decimals: k.integer("decimals").notNull().default(2),
  isPivot: k.boolean("is_pivot").notNull().default(false),
  pinned: k.boolean("pinned").notNull().default(false),
  archived: k.boolean("archived").notNull().default(false),
  sort: k.integer("sort").notNull().default(0),
  updatedAt: k.timestamp("updated_at").notNull(),
  version: k.version("version").notNull().default(1),
});
