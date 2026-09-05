/**
 * The offline match index — `SPEC.md` §14.4b: *"a transaction for ORLEN,
 * YouTube or another recognised merchant shows its real mark immediately —
 * including when it was created with no internet."*
 *
 * **Exact match on the folded whole payee, not a substring search.**
 * `findName` (`capture/names.ts`) already does word-boundary substring
 * matching for the capture grammar, where a merchant name is one token among
 * others in a longer sentence; a transaction's `payee` field is the merchant
 * name itself; end to end, so the simpler exact-match index is what "normalised
 * alias → key" means here. A fuzzy/substring brand match is future work
 * (tier 1.5, matching D2's own scope note), not this catalogue's job today.
 *
 * **Never normalises `payee` itself.** `SPEC.md`: *"the payee remains
 * evidence and is never normalised away."* This module reads `payee` and
 * returns a `key`; nothing here writes back to the field it read.
 */

import { fold } from "../capture/names.ts";
import { BRAND_CATALOG, type BrandSource, isValidBrandKey } from "./catalog.ts";

/**
 * `normalised alias → key`, built once. A `Map`, not a re-scan of
 * `BRAND_CATALOG` per call — the catalogue is small today, but the lookup
 * this function offers is the one thing that must stay O(1) as it grows,
 * because it runs inside every offline `create_transaction`/
 * `update_transaction` write.
 */
const ALIAS_INDEX: ReadonlyMap<string, string> = new Map(
  BRAND_CATALOG.flatMap((entry) => entry.aliases.map((alias) => [fold(alias), entry.key])),
);

/** The catalogue key `payee` matches, or `undefined` — folded, exact-match only (see the file header). */
export function matchBrand(payee: string): string | undefined {
  const folded = fold(payee.trim());
  if (folded === "") return undefined;
  return ALIAS_INDEX.get(folded);
}

export type ResolvedBrand = { brandKey: string | null; brandSource: BrandSource | null };

/**
 * The one function every transaction write path calls to fill `brand_key`/
 * `brand_source` — `create-transaction.executor.ts` for a fresh row,
 * `update-transaction.executor.ts` when a patch touches `brandKey` or
 * `payee`. Keeping the rule in one place is what makes "both present, or
 * both absent" (the DB `CHECK`) and "manual beats catalogue" (§14.4b) a
 * single fact rather than two write paths that could drift.
 *
 * - `assertedKey` present (already catalogue-validated at the Zod boundary,
 *   `registry/inputs.ts`) → `manual`. A person or a future editor said so;
 *   the payee is not consulted.
 * - Otherwise, `payee` matched → `catalog`.
 * - Otherwise, both `null` — an unrecognised payee is not blank at the
 *   `brand_key` level; `BrandIcon`'s monogram fallback is what keeps the
 *   *screen* from being blank.
 */
export function resolveBrand(payee: string, assertedKey: string | undefined): ResolvedBrand {
  if (assertedKey !== undefined) {
    return { brandKey: assertedKey, brandSource: "manual" };
  }
  const matched = matchBrand(payee);
  if (matched !== undefined) {
    return { brandKey: matched, brandSource: "catalog" };
  }
  return { brandKey: null, brandSource: null };
}

/** Re-exported so a caller needs one import for "is this key any good at all". */
export { isValidBrandKey };
