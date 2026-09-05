/**
 * `SPEC.md` §14.4b — bootstraps `brand_aliases` from the bundled catalogue.
 *
 * **Its own file, not inlined in `run.ts` (round 1's M2).** `run.ts` calls
 * `main()` unconditionally at module load and exits the process — a script,
 * not an importable module — so a function that lived there could not be
 * exercised by a test without spawning a subprocess. Taking `db` as a
 * parameter, rather than closing over `run.ts`'s own module-level instance,
 * is what makes `seedBrandAliases(scratch.db)` a normal call in a normal
 * test.
 *
 * **`onConflictDoNothing`, not `onConflictDoUpdate`.** §14.4b and
 * `brand-aliases.pg.ts` both promise the `currencies` shape verbatim:
 * *"bootstrapped, never restored"* (`architecture/14` §14.6 — *"a later
 * launch does not overwrite a currency someone has edited"*). An earlier
 * version of this function did the opposite — `onConflictDoUpdate` — which
 * silently reverted a hand-edited alias on the next `pnpm db:seed`, exactly
 * the failure `ON CONFLICT DO NOTHING` exists to rule out.
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
