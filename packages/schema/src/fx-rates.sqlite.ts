import { currencies } from "./currencies.sqlite.ts";
import { FX_SOURCE } from "./enums.ts";
import { sqliteKit as k } from "./kit.ts";

/** See `fx-rates.pg.ts`. */
export const fxRatesColumns = () => ({
  base: k
    .text("base")
    .notNull()
    .references(() => currencies.code),
  quote: k
    .text("quote")
    .notNull()
    .references(() => currencies.code),
  date: k.date("date").notNull(),
  // §4: `to_pivot(x) = x ÷ rate`. Divide by this one.
  rate: k.unitsPerPivot("rate").notNull(),
  source: k.text("source", { enum: FX_SOURCE }).notNull(),
  fetchedAt: k.timestamp("fetched_at"),
});

/**
 * A bare table, for the parity assertion to compare.
 *
 * The composite primary key `(base, quote, date)` — a rate's actual identity —
 * lives with the two checks in `packages/db`, because it is a constraint rather
 * than a column and §14.7 keeps those layered around the shared set.
 */
export const fxRates = k.table("fx_rates", fxRatesColumns());
