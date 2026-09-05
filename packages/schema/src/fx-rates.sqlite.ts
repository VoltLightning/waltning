import { sql } from "drizzle-orm";
import { check } from "drizzle-orm/sqlite-core";
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
 * mirrored here, unlike `fx_rates_rate_positive` and `fx_rates_distinct`,
 * which stay server-only in `packages/db`. The difference is not a guarantee
 * this file cares about more: without a unique index the phone's own upsert
 * (`set_manual_rate`'s one-row-per-day write) has no conflict target, and
 * would insert a second row for a date already held rather than replacing it
 * — a bug on this device alone, with or without a server ever agreeing.
 *
 * **`fx_rates_rate_bounds` is mirrored for the same kind of reason (H2).**
 * The rows it guards are minted *on the phone*: `change_pivot` rebases every
 * rate by division and parses none of the results, so the contract edge
 * (`zUnitsPerPivot`) never sees them. A rate outside these bounds is one
 * `create_transaction` then throws on while pricing a capture — inside
 * `apply`, after the outbox entry has already committed. That failure happens
 * on this device whether a server ever agrees or not, which is exactly the
 * test this file's twins are chosen by. `money.ts`'s `RATE_MIN_EXCLUSIVE`
 * says what each bound buys.
 */
export const fxRates = k.table("fx_rates", fxRatesColumns(), (t) => [
  k.uniqueIndex("fx_rates_pk").on(t.base, t.quote, t.date),
  // `cast(… as real)`, unlike the Postgres twin: SQLite stores a rate as TEXT
  // (there is no exact decimal type — `kit.ts`'s header), and its type
  // ordering puts *every* TEXT value above *every* number, so an uncast
  // comparison would read `'0.25' < 999999999999` as false and refuse every
  // row ever written. A double has far more than the twelve places this
  // interval's endpoints need to be told apart. The ceiling itself is
  // `999999999999` (`money.ts`'s `RATE_MAX_EXCLUSIVE`), not `1e12` — the
  // Postgres twin's own reason applies here too, even though SQLite has no
  // column width to overflow: the two engines hold the same bound so a rate
  // this CHECK refuses is refused identically on both.
  check(
    "fx_rates_rate_bounds",
    sql`cast(${t.rate} as real) > 0.000000000001 and cast(${t.rate} as real) < 999999999999`,
  ),
]);
