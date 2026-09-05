/**
 * `SPEC.md` §14.4b — bootstraps `brand_aliases` from the bundled catalogue.
 *
 * **`onConflictDoNothing`, never an upsert.** `architecture/14` §14.6:
 * *"Reference data is bootstrapped, never restored: the insert is `ON
 * CONFLICT DO NOTHING`, so a later launch does not overwrite a currency
 * someone has edited."* The same rule the currency seed beside this one
 * (`./currencies.ts`) and the phone's own replica bootstrap
 * (`packages/ledger/src/session.ts`) follow: an upsert would make
 * `pnpm db:seed` a silent revert of every hand-pointed alias.
 *
 * **Its own file, taking `db` as a parameter.** `run.ts` calls `main()`
 * unconditionally at module load and exits the process — a script, not an
 * importable module — so a function that lived there could not be exercised
 * by a test without spawning a subprocess. `seedBrandAliases(scratch.db)` is
 * a normal call in a normal test.
 */

import { BRAND_CATALOG } from "@waltning/core/brands/catalog";
import type { Database } from "../client.ts";
import { brandAliases as brandAliasesTable } from "../schema.ts";

export async function seedBrandAliases(db: Database): Promise<number> {
  let aliases = 0;
  for (const entry of BRAND_CATALOG) {
    for (const alias of entry.aliases) {
      await db
        .insert(brandAliasesTable)
        .values({ alias, brandKey: entry.key })
        .onConflictDoNothing();
      aliases++;
    }
  }
  return aliases;
}
