import { FX_SOURCE } from "./enums.ts";
import { sqliteKit as k } from "./kit.ts";

/** See `currencies.pg.ts` for why this is a factory and not an object. */
export const currenciesColumns = () => ({
  code: k.currency("code").primaryKey(),
  name: k.text("name").notNull(),
  symbol: k.text("symbol").notNull().default(""),
  symbolPosition: k.text("symbol_position").notNull().default("P"),
  decimals: k.integer("decimals").notNull().default(2),
  isPivot: k.boolean("is_pivot").notNull().default(false),
  pinned: k.boolean("pinned").notNull().default(false),
  /**
   * SQLite has no `ENUM`, so the same set arrives as a `text` constrained to
   * it. Drizzle infers the identical union from both, which is what lets the
   * server keep a compile-time check the phone also gets.
   */
  rateSource: k.text("rate_source", { enum: FX_SOURCE }),
  archived: k.boolean("archived").notNull().default(false),
  sort: k.integer("sort").notNull().default(0),
  updatedAt: k.stamp("updated_at"),
  version: k.version("version").notNull().default(1),
});

export const currencies = k.table("currencies", currenciesColumns());
