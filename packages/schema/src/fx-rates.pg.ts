import { currencies } from "./currencies.pg.ts";
import { fxSource } from "./enums.pg.ts";
import { pgKit as k } from "./kit.ts";

/**
 * Daily reference rates, all quoted against the pivot (§7.7).
 *
 * The composite primary key — `(base, quote, date)` *is* a rate's identity —
 * and the two checks stay in `packages/db`: SQLite expresses neither the same
 * way, and §14.7 keeps engine-specific guarantees layered around the shared
 * columns rather than inside them.
 */
export const fxRatesColumns = () => ({
  base: k
    .currency("base")
    .notNull()
    .references(() => currencies.code),
  quote: k
    .currency("quote")
    .notNull()
    .references(() => currencies.code),
  date: k.date("date").notNull(),
  // §4: `to_pivot(x) = x ÷ rate`. Divide by this one.
  rate: k.unitsPerPivot("rate").notNull(),
  source: fxSource("source").notNull(),
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
