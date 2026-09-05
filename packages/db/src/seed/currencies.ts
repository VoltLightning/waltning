/**
 * Bootstraps `currencies` from `@waltning/core/currencies` — the same list the
 * phone's replica bootstraps from (`packages/ledger/src/session.ts`), so the
 * two surfaces cannot disagree about a currency's `decimals`, which is
 * arithmetic.
 *
 * **`onConflictDoNothing`, never an upsert.** `architecture/14` §14.6:
 * *"Reference data is bootstrapped, never restored: the insert is `ON CONFLICT
 * DO NOTHING`, so a later launch does not overwrite a currency someone has
 * edited."* The table is the source of truth once it exists — `currencies.ts`
 * says so itself: *"someone can add a currency, archive one, or change a
 * symbol, and the row wins from that moment"* — and this list is only what a
 * database holds before anyone has touched it. An upsert here would make
 * `pnpm db:seed` a silent revert of every hand-edited symbol, pin and rate
 * source, which is exactly the failure `DO NOTHING` exists to rule out.
 *
 * **Its own file, taking `db` as a parameter.** `run.ts` calls `main()`
 * unconditionally at module load and exits the process — a script, not an
 * importable module — so a function living there could not be exercised by a
 * test without spawning a subprocess. `seedBrandAliases` sits beside this one
 * for the same reason.
 */

import { currencies as currencySeed } from "@waltning/core/currencies";
import type { Database } from "../client.ts";
import { currencies as currenciesTable } from "../schema.ts";

export async function seedCurrencies(db: Database): Promise<number> {
  for (const c of currencySeed) {
    await db
      .insert(currenciesTable)
      .values({
        code: c.code,
        name: c.name,
        symbol: c.symbol,
        symbolPosition: c.symbolPosition,
        decimals: c.decimals,
        isPivot: c.isPivot ?? false,
        pinned: c.pinned ?? false,
        rateSource: c.rateSource,
      })
      .onConflictDoNothing();
  }
  return currencySeed.length;
}
