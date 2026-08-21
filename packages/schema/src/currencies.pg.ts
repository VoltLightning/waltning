import { fxSource } from "./enums.pg.ts";
import { pgKit as k } from "./kit.ts";

/**
 * The columns, as a factory.
 *
 * **A function rather than an object**, because a Drizzle column builder is
 * stateful: `pgTable()` stamps the table's name onto every builder it is given,
 * so handing the same instance to two tables makes the second one rename the
 * first's columns. Two calls, two sets of builders, no shared mutable state.
 *
 * `packages/db` builds the real table from this and layers the Postgres-only
 * half — checks, indexes, generated columns — around it (§14.7). This module
 * builds a bare table from the same columns so `parity.type-test.ts` has
 * something to compare against SQLite.
 */
export const currenciesColumns = () => ({
  code: k.currency("code").primaryKey(), // ISO 4217
  name: k.text("name").notNull(),
  symbol: k.text("symbol").notNull().default(""),
  /** 'P' prefix or 'S' suffix. */
  symbolPosition: k.text("symbol_position").notNull().default("P"),
  decimals: k.integer("decimals").notNull().default(2),
  /**
   * The technical hub every stored rate is quoted against (§7.0). Chosen once
   * as USD and never surfaced in the interface. NOT a reporting currency —
   * there isn't one; display currency is a client preference.
   */
  isPivot: k.boolean("is_pivot").notNull().default(false),
  /** Shown in the header display-currency toggle. */
  pinned: k.boolean("pinned").notNull().default(false),
  rateSource: fxSource("rate_source"),
  archived: k.boolean("archived").notNull().default(false),
  sort: k.integer("sort").notNull().default(0),
  updatedAt: k.stamp("updated_at"),
  version: k.version("version").notNull().default(1),
});

export const currencies = k.table("currencies", currenciesColumns());
