import { currencies } from "./currencies.sqlite.ts";
import { FX_SOURCE } from "./enums.ts";
import { sqliteKit as k } from "./kit.ts";

/** See `fx-rates.pg.ts`. */
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
  source: k.text("source", { enum: FX_SOURCE }).notNull(),
  fetchedAt: k.timestamp("fetched_at"),

  /** See `fx-rates.pg.ts` — the row `set_manual_rate` displaced (C1). */
  displacedRate: k.unitsPerPivot("displaced_rate"),
  displacedSource: k.text("displaced_source", { enum: FX_SOURCE }),
  displacedFetchedAt: k.timestamp("displaced_fetched_at"),
});

/**
 * `fx_rates_pk` — `(base, quote, date)`, a rate's actual identity — **is**
 * mirrored here, unlike the two `CHECK`s (`fx_rates_rate_positive`,
 * `fx_rates_distinct`), which stay server-only in `packages/db`. The
 * difference is not a guarantee this file cares about more: without a
 * unique index the phone's own upsert (`set_manual_rate`'s one-row-per-day
 * write) has no conflict target, and would insert a second row for a date
 * already held rather than replacing it — a bug on this device alone, with
 * or without a server ever agreeing.
 */
export const fxRates = k.table("fx_rates", fxRatesColumns(), (t) => [
  k.uniqueIndex("fx_rates_pk").on(t.base, t.quote, t.date),
]);
