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
 *
 * **"Normalised", precisely.** `fold` (`capture/names.ts`) lower-cases and
 * maps only the Polish diacritics this product's other language needs
 * (`ąćęłńóśźż`); it is *not* a general Unicode diacritic strip, so `"Café"`
 * folds to `"café"`, not `"cafe"`. That is fine for a two-entry,
 * ASCII-and-Polish catalogue and stops being fine the day a third alias needs
 * a diacritic outside that set — a real, named limit, pinned by
 * `match.test.ts` asserting `fold`'s own output rather than only that the
 * catalogue misses. Internal whitespace *is* collapsed here, locally
 * (`normaliseSpace`, below) — not inside `fold` itself, which several other
 * callers (`capture/`) depend on staying exactly as narrow as it is — so
 * `"YouTube  Premium"` (a doubled space) and `"YouTube Premium"` fold to the
 * same key.
 */

import { fold } from "../capture/names.ts";
import { BRAND_CATALOG, type BrandSource, isValidBrandKey } from "./catalog.ts";

/** Collapses any run of whitespace to one space, trimmed. Local to this file — see the header's note on why `fold` itself does not gain this. */
function normaliseSpace(s: string): string {
  return s.trim().replace(/\s+/g, " ");
}

/**
 * `normalised alias → key`, built once. A `Map`, not a re-scan of
 * `BRAND_CATALOG` per call — the catalogue is small today, but the lookup
 * this function offers is the one thing that must stay O(1) as it grows,
 * because it runs inside every offline `create_transaction`/
 * `update_transaction` write.
 */
const ALIAS_INDEX: ReadonlyMap<string, string> = new Map(
  BRAND_CATALOG.flatMap((entry) =>
    entry.aliases.map((alias) => [fold(normaliseSpace(alias)), entry.key]),
  ),
);

/** The catalogue key `payee` matches, or `undefined` — folded, exact-match only (see the file header). */
export function matchBrand(payee: string): string | undefined {
  const folded = fold(normaliseSpace(payee));
  if (folded === "") return undefined;
  return ALIAS_INDEX.get(folded);
}

export type ResolvedBrand = { brandKey: string | null; brandSource: BrandSource | null };

/**
 * The function `create_transaction` calls to fill a fresh row's `brand_key`/
 * `brand_source`. `update_transaction`'s own resolution is `resolveBrandPatch`,
 * below — a patch has a *current* value, an explicit clear, and a sticky
 * "none" a fresh row cannot have, which is why it is not this function with
 * extra arguments.
 *
 * - `assertedKey` present (already catalogue-validated at the Zod boundary,
 *   `registry/inputs.ts`) → `manual`. A person or a future editor said so;
 *   the payee is not consulted.
 * - Otherwise, `payee` matched → `auto`.
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
    return { brandKey: matched, brandSource: "auto" };
  }
  return { brandKey: null, brandSource: null };
}

export type CurrentBrand = { brandKey: string | null; brandSource: BrandSource | null };

/**
 * `update_transaction`'s own brand resolution. A patch differs from a fresh
 * create in three ways `resolveBrand` has no expression for: the row already
 * has a value, `brandKey: null` is an explicit *clear* rather than "nothing
 * asserted", and a clear has to stay cleared. `brand_source: "none"` is what
 * makes the last one possible — a *deliberate* "no brand", distinct from
 * `null`/`null` (never matched at all) and, like `"manual"`, sticky against a
 * later payee edit. Without it a clear falls back to "let the payee decide",
 * the payee still folds to the same alias, and the wrong mark returns on the
 * next write — correctable only by editing evidence §14.4b says is never
 * normalised away.
 *
 * The caller calls this only when the patch asserts a `brandKey` or *changes*
 * the payee (`update-transaction.executor.ts`'s own gate — an unrelated field
 * change must not recompute or rewrite either column). `undefined` back means
 * "leave both columns alone."
 *
 * - `brandKeyValue` is `null` → explicit clear: `{ null, "none" }`. The payee
 *   is not consulted, now or on a later edit.
 * - `brandKeyValue` is a string → `manual`, the same catalogue-validated
 *   assertion `resolveBrand` gives a fresh row.
 * - `brandKeyValue` is `undefined` (the patch has no opinion, so only `payee`
 *   changed) → re-matched **only** while the current source is `null` or
 *   `"auto"`; `"manual"` and `"none"` are both sticky, by the same rule for a
 *   different reason each — a person's own choice, and a person's own choice
 *   to have none.
 */
export function resolveBrandPatch(
  current: CurrentBrand,
  payee: string,
  brandKeyValue: string | null | undefined,
): ResolvedBrand | undefined {
  if (brandKeyValue === null) {
    return { brandKey: null, brandSource: "none" };
  }
  if (brandKeyValue !== undefined) {
    return { brandKey: brandKeyValue, brandSource: "manual" };
  }
  if (current.brandSource === null || current.brandSource === "auto") {
    return resolveBrand(payee, undefined);
  }
  return undefined;
}

/** Re-exported so a caller needs one import for "is this key any good at all". */
export { isValidBrandKey };
