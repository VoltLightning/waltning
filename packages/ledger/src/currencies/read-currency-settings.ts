/**
 * `readCurrencySettings` — S17's whole list, against the replica.
 *
 * `readCurrencies` (`./read-currencies.ts`) answers *what can a capture be
 * valued in right now* — code, name, symbol, decimals, `capturable` — which is
 * everything a picker needs and nothing a settings row does. S17 §3 lists a
 * row's columns as code, name, symbol, decimals, **rate source**, **pinned**,
 * coverage, archive, plus a **pivot** marker and the **version** every write
 * on this table takes (`add_currency`'s own row shape, `LocalCurrencyRow`) —
 * none of which `readCurrencies` carries, because nothing before this needed
 * them off the wire.
 *
 * **Returns the row as the table holds it**, matching `LocalCurrencyRow`
 * field for field rather than a narrower projection: the four FX executors
 * (`set_pinned`, `set_rate_source`, `archive_currency`, `change_pivot`) all
 * return that exact shape already, so a screen that lists with this reader and
 * writes with one of those never reconciles two different row types for one
 * table.
 */

import { asc, eq } from "drizzle-orm";
import type { ReplicaDb } from "../open.ts";
import { ledgerSchema } from "../schema-map.ts";
import type { LocalCurrencyRow } from "./add-currency.executor.ts";

const { currencies } = ledgerSchema;

/**
 * `includeArchived` — default `false`, the same lazy-toggle shape
 * `listAccounts`/`listCounterparties` already give S16 and S15's registers.
 * S17 does not currently offer an archived view (§6: archived is a gate on
 * every other row, not a toggle of its own), so the option exists for parity
 * with those readers rather than a caller today — the day S17 grows one, this
 * does not.
 */
export function readCurrencySettings<TRun, TSchema extends typeof ledgerSchema>(
  db: ReplicaDb<TRun, TSchema>,
  options: { includeArchived?: boolean } = {},
): readonly LocalCurrencyRow[] {
  const { includeArchived = false } = options;

  return db
    .select()
    .from(currencies)
    .where(includeArchived ? undefined : eq(currencies.archived, false))
    .orderBy(asc(currencies.sort), asc(currencies.code))
    .all();
}
