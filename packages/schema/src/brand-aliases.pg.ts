import { pgKit as k } from "./kit.ts";

/**
 * `SPEC.md` §14.4b — the durable record of `@waltning/core/brands/catalog`'s
 * bundled aliases, bootstrapped the same way `currencies` is: both seeds
 * insert `ON CONFLICT DO NOTHING` (`packages/db/src/seed/brand-aliases.ts`
 * and `seed/currencies.ts`), so `architecture/14` §14.6's *"reference data is
 * bootstrapped, never restored"* is what the code does and not only what this
 * comment says. Nothing writes here beyond that seed
 * this arc — no `create_brand_alias` operation exists — so this table is
 * ready for a future admin/rule write path without being one itself yet.
 *
 * **`alias` is the primary key, not a generated id** — the same shape
 * `currencies.code` already gives a natural key: one row per normalised
 * alias is exactly "one non-blank normalised alias wins", enforced by the
 * key itself rather than by a uniqueness check layered on top. The
 * catalogue's own contract test (`brands/catalog.test.ts`) asserts no two
 * entries collide on one, so the seed never exercises this row's own
 * conflict path in the first place.
 */
export const brandAliasesColumns = () => ({
  /** Already folded (`capture/names.ts`'s `fold`) — the same normalisation `match.ts` applies to an incoming payee before it looks this table up. */
  alias: k.text("alias").primaryKey(),
  /** Waltning-owned catalogue key — never an upstream slug (`SPEC.md` §14.4b). No FK: the set of valid keys is versioned code, not a table (`brands/catalog.ts`'s own header). */
  brandKey: k.text("brand_key").notNull(),
  createdAt: k.stamp("created_at"),
  updatedAt: k.stamp("updated_at"),
});

export const brandAliases = k.table("brand_aliases", brandAliasesColumns());
